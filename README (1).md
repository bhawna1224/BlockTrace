# 🔗 Blockchain Supply Chain Tracking System

A decentralized supply chain tracking DApp built with **Ethereum**, **Solidity**, and **React.js**, featuring **multi-signature governance** for decentralized role management.

---

## 📁 Project Structure

```
supply-chain/
├── contracts/
│   └── SupplyChain.sol       ← Smart contract (deploy via Remix)
├── frontend/
│   └── src/
│       └── App.jsx           ← React frontend (Vite or CRA)
└── README.md
```

---

## 🛠️ Tech Stack

| Layer              | Technology                  |
|--------------------|-----------------------------|
| Blockchain         | Ethereum (Ganache locally)  |
| Smart Contracts    | Solidity ^0.8.19            |
| Dev Tools          | Remix IDE, Ganache           |
| Frontend           | React.js                    |
| Blockchain Bridge  | Ethers.js v6                |
| Wallet             | MetaMask                    |

---

## 🏛️ Governance Model — Multi-Signature Ownership

This system uses **2-of-3 multi-signature governance** instead of a single owner. No individual can control the system alone.

### Who Are the Signers?

```
Deployer (Account 1)         = Tech company that builds the system
                               Sets up council, then RENOUNCES all power

Council Signer 1 (Account 2) = Manufacturer Representative (e.g. Nike HQ)
Council Signer 2 (Account 3) = Distributor Representative (e.g. FedEx HQ)
Council Signer 3 (Account 4) = Retailer Representative (e.g. Walmart HQ)

Customer                     = No account needed (read-only, no gas fees)
```

### Why No Single Owner?

In a real supply chain consortium, no single company should control who joins the network. Multi-sig ensures:

- **Nike alone** cannot add a fake distributor
- **FedEx alone** cannot onboard an unauthorized retailer
- **Any 2 out of 3** council members must agree before a role is assigned

### Role Assignment Flow

```
Any council member proposes a role assignment
        ↓
A second council member approves
        ↓
2 of 3 reached → role is automatically assigned
        ↓
Proposal expires after 7 days if not enough approvals
```

### Deployer Renouncement

After setting up the council, the deployer calls `renounce()` and permanently loses all special privileges. The system is then fully controlled by the 3 council members.

```
Real World Analogy:
IBM builds the system for a shipping consortium
IBM sets up Maersk, MSC, and CMA CGM as council members
IBM removes itself → has zero control going forward
Maersk + MSC must agree to onboard any new participant
```

---

## 👥 Role System

| Role         | Value | Permissions                                      | Needs Account? |
|--------------|-------|--------------------------------------------------|----------------|
| None         | 0     | No permissions                                   | —              |
| Manufacturer | 1     | Add products                                     | ✅ Yes          |
| Distributor  | 2     | Pickup → Warehouse → Dispatch                    | ✅ Yes          |
| Retailer     | 3     | Receive → Mark as Sold                           | ✅ Yes          |
| Customer     | 4     | Track and verify products (read-only, free)      | ❌ No           |

**Roles are assigned by the multi-sig council**, not by a single owner.

---

## 🚀 Setup & Deployment — Step by Step

### Phase 1 · Ganache (Local Blockchain)

1. Download and install **Ganache** from https://trufflesuite.com/ganache/
2. Click **"New Workspace"** → **"Ethereum"** → **Start**
3. Note down:
   - **RPC Server**: `HTTP://127.0.0.1:7545`
   - **Chain ID**: `1337`
   - 10 pre-funded accounts with 100 ETH each

---

### Phase 2 · MetaMask Setup

1. Install the **MetaMask** browser extension
2. Open MetaMask → **Add a network manually**:
   - Network Name: `Ganache`
   - New RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337`
   - Currency Symbol: `ETH`
3. **Import 4 accounts** from Ganache (click 🔑 key icon → copy private key → MetaMask → Import Account):

| MetaMask Account | Ganache Account | Role |
|-----------------|-----------------|------|
| Account 1 | Ganache Account 1 | Deployer (temporary) |
| Account 2 | Ganache Account 2 | Manufacturer Rep (council) |
| Account 3 | Ganache Account 3 | Distributor Rep (council) |
| Account 4 | Ganache Account 4 | Retailer Rep (council) |

---

### Phase 3 · Deploy the Smart Contract (Remix IDE)

1. Open **https://remix.ethereum.org**
2. Create a new file: `SupplyChain.sol`
3. Paste the contents of `contracts/SupplyChain.sol`
4. In the **Solidity Compiler** tab:
   - Compiler: `0.8.19+`
   - Click **Compile SupplyChain.sol**
5. In the **Deploy & Run Transactions** tab:
   - Environment: **Injected Provider - MetaMask**
   - Switch MetaMask to **Account 1 (Deployer)**
   - In the Deploy section, enter the 3 council addresses (Account 2, 3, 4) as constructor arguments
   - Click **Deploy** → confirm in MetaMask
6. Copy the **deployed contract address**

---

### Phase 4 · Deployer Renounces Ownership

After deployment, Account 1 must renounce:

1. In Remix → **Deployed Contracts** → find `renounce()` function
2. Make sure MetaMask is on **Account 1**
3. Click `renounce()` → confirm in MetaMask
4. Account 1 now has zero power — council takes over

---

### Phase 5 · Council Assigns Initial Roles

Now the council assigns roles to operating accounts:

1. Switch MetaMask to **Account 2 (Manufacturer Rep)**
2. Go to **Governance page** in the DApp → propose Account 2 as Manufacturer
3. Switch to **Account 3 (Distributor Rep)** → approve the proposal
4. 2/3 reached → Account 2 is now a Manufacturer ✅
5. Repeat for Distributor (Account 3) and Retailer (Account 4)

---

### Phase 6 · Frontend Setup

```bash
# Vite (recommended, requires Node.js v20.19+ or v22+)
npm create vite@latest supply-chain-ui -- --template react
cd supply-chain-ui
npm install
# Replace src/App.jsx with the provided App.jsx
npm run dev

# If on older Node.js (v20.12 etc), use Vite 5:
npm create vite@5 supply-chain-ui -- --template react
```

> **Note**: `ethers` is loaded via CDN ESM import in the provided App.jsx.
> If your bundler prefers a local install: `npm install ethers`
> Then change the import to: `import { ethers } from "ethers";`

---

### Phase 7 · Connect the DApp

1. Open the frontend in your browser (usually `http://localhost:5173`)
2. Click **"Connect MetaMask"** — approve the connection
3. Paste the **contract address** from Phase 3 into the input field
4. Click **"Load Contract"**

You're live! 🎉

---

## 🔄 Supply Chain Workflow

```
Manufacturer adds product
        ↓
Distributor: pickupFromManufacturer   (Created → InTransit)
        ↓
Distributor: storeAtWarehouse         (InTransit → AtWarehouse)  [optional]
        ↓
Distributor: dispatchToRetailer       (→ OutForDelivery)
        ↓
Retailer: receiveAtRetailer           (→ AtRetailer)
        ↓
Retailer: markAsSold                  (→ Sold)
        ↓
Customer: track product               (read-only, no account needed)
```

---

## 🗳️ Multi-Sig Governance Workflow

```
Council Member A: proposeRole(targetAddress, role)
        ↓
Council Member B: approveProposal(proposalId)
        ↓
2/3 approvals reached → role auto-assigned ✅

If proposal not approved within 7 days → expires ❌
```

---

## 🔍 Testing Different Roles

Switch between accounts in MetaMask to simulate different participants:

| Action | Switch to |
|--------|-----------|
| Propose a role | Any council account (2, 3, or 4) |
| Approve a proposal | A different council account |
| Add a product | Account with Manufacturer role |
| Pickup / Warehouse / Dispatch | Account with Distributor role |
| Receive / Sell | Account with Retailer role |
| Track a product | Any account (or no account needed) |

---

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| MetaMask not connecting | Ensure Ganache is running and the Ganache network is selected |
| Transaction reverted | Check you have the correct role for the action |
| "Product not found" | Ensure the contract address is correct |
| Proposal not executing | Need 2 different council accounts to approve |
| Nonce error | Reset MetaMask: Settings → Advanced → Reset Account |

---

## 📜 Smart Contract Functions

### Governance (council members only)
- `proposeRole(address, role)` → Any council member proposes a role assignment
- `approveProposal(proposalId)` → Different council member approves
- `renounce()` → Deployer removes themselves after setup

### Supply Chain Write (requires MetaMask signature)
- `addProduct(name, description)` → Manufacturer only
- `pickupFromManufacturer(id, note)` → Distributor only
- `storeAtWarehouse(id, note)` → Distributor only
- `dispatchToRetailer(id, note)` → Distributor only
- `receiveAtRetailer(id, note)` → Retailer only
- `markAsSold(id, note)` → Retailer only

### Read (free, no gas, no account needed)
- `getProduct(id)` → Returns full product details
- `getProductHistory(id)` → Returns complete status history
- `totalProducts()` → Total registered products
- `myRole()` → Role of the calling address
- `getProposal(id)` → Returns proposal details and approval status
- `isCouncilMember(address)` → Check if address is a council member

---

## 🌍 Real World vs Our Implementation

| Aspect | Our Implementation | Production |
|--------|-------------------|------------|
| Blockchain | Ganache (local) | Ethereum Mainnet / Hyperledger |
| Governance | 2-of-3 multi-sig | Weighted voting / DAO |
| Customer verification | Product ID input | QR code scan |
| Gas fees | Free (test ETH) | Real ETH |
| Node count | 1 (your laptop) | Thousands of nodes globally |
