// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SupplyChain (BlockTrace)
 * @dev Blockchain-based supply chain tracking system with 2-of-3 multi-sig governance.
 *
 * Governance Model:
 *   - Deployer sets 3 council members (Manufacturer Rep, Distributor Rep, Retailer Rep)
 *   - Deployer then renounces all power
 *   - Any role assignment requires 2 of 3 council members to approve
 *   - Proposals expire after 7 days if not enough approvals
 *
 * Supply Chain Flow:
 *   Created → InTransit → AtWarehouse (optional) → OutForDelivery → AtRetailer → Sold
 */
contract SupplyChain {

    // ─── Enums ────────────────────────────────────────────────────────────────

    enum Role { None, Manufacturer, Distributor, Retailer, Customer }

    enum ProductStatus {
        Created,        // 0 – Manufacturer registered the product
        InTransit,      // 1 – Picked up by distributor
        AtWarehouse,    // 2 – Held at distributor warehouse
        OutForDelivery, // 3 – Dispatched to retailer
        AtRetailer,     // 4 – Received by retailer
        Sold            // 5 – Purchased by customer
    }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct HistoryEntry {
        ProductStatus status;
        address       updatedBy;
        uint256       timestamp;
        string        note;
    }

    struct Product {
        uint256       id;
        string        name;
        string        description;
        address       manufacturer;
        uint256       createdAt;
        ProductStatus currentStatus;
        bool          exists;
    }

    struct Proposal {
        uint256 id;
        address proposedBy;
        address target;       // address to assign role to
        Role    role;         // role to assign
        uint256 approvalCount;
        uint256 createdAt;
        bool    executed;
        bool    expired;
    }

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant REQUIRED_APPROVALS = 2;
    uint256 public constant PROPOSAL_EXPIRY    = 7 days;

    // ─── State ────────────────────────────────────────────────────────────────

    address public deployer;
    bool    public deployerRenounced;

    address[3] public council;  // 3 council members

    mapping(address => bool) public isCouncilMember;
    mapping(address => Role) public roles;

    uint256 private _nextProductId  = 1;
    uint256 private _nextProposalId = 1;

    mapping(uint256 => Product)      public products;
    mapping(uint256 => HistoryEntry[]) public productHistory;
    mapping(uint256 => Proposal)     public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApproved;

    // ─── Events ───────────────────────────────────────────────────────────────

    event CouncilSetup(address[3] members);
    event DeployerRenounced(address deployer);
    event ProposalCreated(uint256 indexed proposalId, address indexed proposedBy, address target, Role role);
    event ProposalApproved(uint256 indexed proposalId, address indexed approvedBy, uint256 approvalCount);
    event ProposalExecuted(uint256 indexed proposalId, address target, Role role);
    event ProposalExpired(uint256 indexed proposalId);
    event RoleAssigned(address indexed account, Role role);
    event ProductAdded(uint256 indexed productId, string name, address indexed manufacturer);
    event StatusUpdated(uint256 indexed productId, ProductStatus newStatus, address indexed updatedBy, string note);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyDeployer() {
        require(msg.sender == deployer, "BT: not deployer");
        require(!deployerRenounced,     "BT: deployer already renounced");
        _;
    }

    modifier onlyCouncil() {
        require(isCouncilMember[msg.sender], "BT: not a council member");
        _;
    }

    modifier onlyRole(Role required) {
        require(roles[msg.sender] == required, "BT: wrong role");
        _;
    }

    modifier productExists(uint256 id) {
        require(products[id].exists, "BT: product not found");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @dev Deploy the contract and set the 3 council members.
     * @param member1 Manufacturer Representative address
     * @param member2 Distributor Representative address
     * @param member3 Retailer Representative address
     */
    constructor(address member1, address member2, address member3) {
        require(member1 != address(0) && member2 != address(0) && member3 != address(0), "BT: zero address");
        require(member1 != member2 && member2 != member3 && member1 != member3, "BT: duplicate members");

        deployer = msg.sender;
        deployerRenounced = false;

        council[0] = member1;
        council[1] = member2;
        council[2] = member3;

        isCouncilMember[member1] = true;
        isCouncilMember[member2] = true;
        isCouncilMember[member3] = true;

        emit CouncilSetup(council);
    }

    // ─── Deployer Setup ───────────────────────────────────────────────────────

    /**
     * @dev Deployer permanently removes themselves from the system.
     * After this call, only the council can govern the contract.
     */
    function renounce() external onlyDeployer {
        deployerRenounced = true;
        emit DeployerRenounced(msg.sender);
    }

    // ─── Governance: Multi-Sig Role Assignment ────────────────────────────────

    /**
     * @dev Any council member proposes assigning a role to an address.
     * @return proposalId The ID of the created proposal.
     */
    function proposeRole(address target, Role role)
        external
        onlyCouncil
        returns (uint256 proposalId)
    {
        require(target != address(0), "BT: zero address");
        require(role != Role.None,    "BT: cannot propose None role via governance");

        proposalId = _nextProposalId++;

        Proposal storage p = proposals[proposalId];
        p.id            = proposalId;
        p.proposedBy    = msg.sender;
        p.target        = target;
        p.role          = role;
        p.approvalCount = 1;   // proposer auto-approves
        p.createdAt     = block.timestamp;
        p.executed      = false;
        p.expired       = false;

        hasApproved[proposalId][msg.sender] = true;

        emit ProposalCreated(proposalId, msg.sender, target, role);
        emit ProposalApproved(proposalId, msg.sender, 1);

        // If somehow 1 approval is enough (e.g. REQUIRED = 1), execute immediately
        if (p.approvalCount >= REQUIRED_APPROVALS) {
            _executeProposal(proposalId);
        }
    }

    /**
     * @dev A different council member approves an existing proposal.
     * Automatically executes if approval threshold is reached.
     */
    function approveProposal(uint256 proposalId) external onlyCouncil {
        Proposal storage p = proposals[proposalId];

        require(p.id != 0,           "BT: proposal does not exist");
        require(!p.executed,         "BT: already executed");
        require(!p.expired,          "BT: proposal expired");
        require(!hasApproved[proposalId][msg.sender], "BT: already approved");

        // Check expiry
        if (block.timestamp > p.createdAt + PROPOSAL_EXPIRY) {
            p.expired = true;
            emit ProposalExpired(proposalId);
            revert("BT: proposal has expired");
        }

        hasApproved[proposalId][msg.sender] = true;
        p.approvalCount++;

        emit ProposalApproved(proposalId, msg.sender, p.approvalCount);

        if (p.approvalCount >= REQUIRED_APPROVALS) {
            _executeProposal(proposalId);
        }
    }

    /**
     * @dev Internal: execute a proposal once threshold is reached.
     */
    function _executeProposal(uint256 proposalId) internal {
        Proposal storage p = proposals[proposalId];
        p.executed = true;

        roles[p.target] = p.role;

        emit ProposalExecuted(proposalId, p.target, p.role);
        emit RoleAssigned(p.target, p.role);
    }

    // ─── Manufacturer Actions ─────────────────────────────────────────────────

    /**
     * @dev Register a new product on the blockchain.
     */
    function addProduct(string calldata name, string calldata description)
        external
        onlyRole(Role.Manufacturer)
        returns (uint256 productId)
    {
        require(bytes(name).length > 0, "BT: name required");

        productId = _nextProductId++;

        products[productId] = Product({
            id:            productId,
            name:          name,
            description:   description,
            manufacturer:  msg.sender,
            createdAt:     block.timestamp,
            currentStatus: ProductStatus.Created,
            exists:        true
        });

        productHistory[productId].push(HistoryEntry({
            status:    ProductStatus.Created,
            updatedBy: msg.sender,
            timestamp: block.timestamp,
            note:      "Product registered by manufacturer"
        }));

        emit ProductAdded(productId, name, msg.sender);
    }

    // ─── Distributor Actions ──────────────────────────────────────────────────

    function pickupFromManufacturer(uint256 id, string calldata note)
        external onlyRole(Role.Distributor) productExists(id)
    {
        require(products[id].currentStatus == ProductStatus.Created, "BT: invalid transition");
        _updateStatus(id, ProductStatus.InTransit, note);
    }

    function storeAtWarehouse(uint256 id, string calldata note)
        external onlyRole(Role.Distributor) productExists(id)
    {
        require(products[id].currentStatus == ProductStatus.InTransit, "BT: invalid transition");
        _updateStatus(id, ProductStatus.AtWarehouse, note);
    }

    function dispatchToRetailer(uint256 id, string calldata note)
        external onlyRole(Role.Distributor) productExists(id)
    {
        require(
            products[id].currentStatus == ProductStatus.InTransit ||
            products[id].currentStatus == ProductStatus.AtWarehouse,
            "BT: invalid transition"
        );
        _updateStatus(id, ProductStatus.OutForDelivery, note);
    }

    // ─── Retailer Actions ─────────────────────────────────────────────────────

    function receiveAtRetailer(uint256 id, string calldata note)
        external onlyRole(Role.Retailer) productExists(id)
    {
        require(products[id].currentStatus == ProductStatus.OutForDelivery, "BT: invalid transition");
        _updateStatus(id, ProductStatus.AtRetailer, note);
    }

    function markAsSold(uint256 id, string calldata note)
        external onlyRole(Role.Retailer) productExists(id)
    {
        require(products[id].currentStatus == ProductStatus.AtRetailer, "BT: invalid transition");
        _updateStatus(id, ProductStatus.Sold, note);
    }

    // ─── Read Functions ───────────────────────────────────────────────────────

    function getProduct(uint256 id)
        external view productExists(id)
        returns (Product memory)
    {
        return products[id];
    }

    function getProductHistory(uint256 id)
        external view productExists(id)
        returns (HistoryEntry[] memory)
    {
        return productHistory[id];
    }

    function totalProducts() external view returns (uint256) {
        return _nextProductId - 1;
    }

    function totalProposals() external view returns (uint256) {
        return _nextProposalId - 1;
    }

    function myRole() external view returns (Role) {
        return roles[msg.sender];
    }

    function getCouncil() external view returns (address[3] memory) {
        return council;
    }

    /**
     * @dev Returns proposal details including whether each council member approved.
     */
    function getProposalDetails(uint256 proposalId)
        external view
        returns (
            Proposal memory proposal,
            bool[3] memory memberApprovals
        )
    {
        proposal = proposals[proposalId];
        memberApprovals[0] = hasApproved[proposalId][council[0]];
        memberApprovals[1] = hasApproved[proposalId][council[1]];
        memberApprovals[2] = hasApproved[proposalId][council[2]];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _updateStatus(uint256 id, ProductStatus newStatus, string memory note) internal {
        products[id].currentStatus = newStatus;

        productHistory[id].push(HistoryEntry({
            status:    newStatus,
            updatedBy: msg.sender,
            timestamp: block.timestamp,
            note:      note
        }));

        emit StatusUpdated(id, newStatus, msg.sender, note);
    }
}
