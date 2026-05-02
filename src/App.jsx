import { useState, useEffect, useCallback } from "react";
import { ethers } from "https://esm.sh/ethers@6.13.0";

// ─── ABI ─────────────────────────────────────────────────────────────────────
const CONTRACT_ABI = [
  // Governance
  "function renounce() external",
  "function proposeRole(address target, uint8 role) external returns (uint256)",
  "function approveProposal(uint256 proposalId) external",
  "function getProposalDetails(uint256 proposalId) external view returns (tuple(uint256 id,address proposedBy,address target,uint8 role,uint256 approvalCount,uint256 createdAt,bool executed,bool expired), bool[3] memberApprovals)",
  "function totalProposals() external view returns (uint256)",
  "function getCouncil() external view returns (address[3])",
  "function isCouncilMember(address) external view returns (bool)",
  "function deployerRenounced() external view returns (bool)",
  "function deployer() external view returns (address)",
  // Roles
  "function myRole() external view returns (uint8)",
  "function roles(address) external view returns (uint8)",
  // Products
  "function addProduct(string name, string description) external returns (uint256)",
  "function pickupFromManufacturer(uint256 id, string note) external",
  "function storeAtWarehouse(uint256 id, string note) external",
  "function dispatchToRetailer(uint256 id, string note) external",
  "function receiveAtRetailer(uint256 id, string note) external",
  "function markAsSold(uint256 id, string note) external",
  "function getProduct(uint256 id) external view returns (tuple(uint256 id,string name,string description,address manufacturer,uint256 createdAt,uint8 currentStatus,bool exists))",
  "function getProductHistory(uint256 id) external view returns (tuple(uint8 status,address updatedBy,uint256 timestamp,string note)[])",
  "function totalProducts() external view returns (uint256)",
  // Events
  "event ProposalCreated(uint256 indexed proposalId, address indexed proposedBy, address target, uint8 role)",
  "event ProposalExecuted(uint256 indexed proposalId, address target, uint8 role)",
  "event ProductAdded(uint256 indexed productId, string name, address indexed manufacturer)",
  "event StatusUpdated(uint256 indexed productId, uint8 newStatus, address indexed updatedBy, string note)",
];

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLE_NAMES  = ["None", "Manufacturer", "Distributor", "Retailer", "Customer"];
const ROLE_COLORS = ["#64748b", "#10b981", "#3b82f6", "#f59e0b", "#ec4899"];
const ROLE_ICONS  = ["—", "🏭", "🚛", "🏪", "👤"];

const STATUS_LABELS = ["Created", "In Transit", "At Warehouse", "Out for Delivery", "At Retailer", "Sold"];
const STATUS_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#64748b"];
const STATUS_ICONS  = ["📦", "🚚", "🏭", "🚀", "🏪", "✅"];

const COUNCIL_LABELS = ["Manufacturer Rep", "Distributor Rep", "Retailer Rep"];

function shortAddr(a) { return a ? `${a.slice(0,6)}…${a.slice(-4)}` : "—"; }
function formatTime(ts) { return new Date(Number(ts) * 1000).toLocaleString(); }
function timeLeft(createdAt) {
  const expiry = Number(createdAt) + 7 * 24 * 3600;
  const diff   = expiry - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "Expired";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #080c18; --surface: #0f1623; --surface2: #162032;
    --border: #1e2d47; --text: #e2e8f0; --muted: #64748b;
    --accent: #6366f1; --accent2: #8b5cf6; --success: #10b981;
    --danger: #ef4444; --warn: #f59e0b;
    --radius: 12px; --font: 'Syne',sans-serif; --mono: 'DM Mono',monospace;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--font); min-height: 100vh; }
  .app { display: flex; flex-direction: column; min-height: 100vh; }

  /* Header */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 28px; border-bottom: 1px solid var(--border);
    background: rgba(8,12,24,.9); backdrop-filter: blur(12px);
    position: sticky; top: 0; z-index: 50;
  }
  .logo { font-size: 1.2rem; font-weight: 800; letter-spacing: -.5px; display:flex; align-items:center; gap:8px; }
  .logo-icon { width:30px; height:30px; border-radius:8px;
    background: linear-gradient(135deg,var(--accent),var(--accent2));
    display:flex; align-items:center; justify-content:center; font-size:1rem; }
  .logo span { color: var(--accent); }

  .hdr-right { display:flex; align-items:center; gap:10px; }
  .wallet-pill {
    display:flex; align-items:center; gap:8px; padding:7px 14px;
    border-radius:999px; background:var(--surface); border:1px solid var(--border);
    font-family:var(--mono); font-size:.78rem; cursor:pointer; transition:border-color .2s;
  }
  .wallet-pill:hover { border-color:var(--accent); }
  .dot { width:7px; height:7px; border-radius:50%; }
  .dot.on { background:var(--success); } .dot.off { background:var(--danger); }

  .role-badge { padding:4px 11px; border-radius:999px; font-size:.72rem; font-weight:700; letter-spacing:.5px; text-transform:uppercase; }

  /* Layout */
  .main { display:flex; flex:1; }
  .sidebar {
    width:210px; flex-shrink:0; border-right:1px solid var(--border);
    padding:20px 12px; display:flex; flex-direction:column; gap:2px;
  }
  .nav-section { font-size:.68rem; font-weight:700; color:var(--muted); letter-spacing:1px; text-transform:uppercase; padding:10px 12px 4px; }
  .nav-item {
    display:flex; align-items:center; gap:9px; padding:9px 12px; border-radius:8px;
    cursor:pointer; font-size:.88rem; color:var(--muted); transition:background .15s,color .15s;
  }
  .nav-item:hover { background:var(--surface); color:var(--text); }
  .nav-item.active { background:rgba(99,102,241,.12); color:var(--accent); }
  .nav-badge { margin-left:auto; background:var(--accent); color:#fff; border-radius:999px; padding:1px 7px; font-size:.68rem; font-weight:700; }

  .content { flex:1; padding:28px; max-width:980px; }

  /* Cards */
  .card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:22px; margin-bottom:18px; }
  .card-title { font-size:1.05rem; font-weight:700; margin-bottom:16px; display:flex; align-items:center; gap:8px; }

  /* Stats */
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; margin-bottom:20px; }
  .stat { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:18px; }
  .stat-val { font-size:1.8rem; font-weight:800; }
  .stat-lbl { font-size:.75rem; color:var(--muted); margin-top:3px; }

  /* Form */
  .field { margin-bottom:14px; }
  .field label { display:block; font-size:.75rem; font-weight:700; color:var(--muted); margin-bottom:5px; letter-spacing:.5px; text-transform:uppercase; }
  .field input, .field select, .field textarea {
    width:100%; padding:9px 13px; background:var(--bg); border:1px solid var(--border);
    border-radius:8px; color:var(--text); font-family:var(--mono); font-size:.88rem;
    outline:none; transition:border-color .2s; resize:vertical;
  }
  .field input:focus, .field select:focus { border-color:var(--accent); }
  .field select option { background:var(--bg); }

  /* Buttons */
  .btn { padding:9px 20px; border-radius:8px; font-family:var(--font); font-weight:700; font-size:.88rem; cursor:pointer; border:none; transition:opacity .15s,transform .1s; display:inline-flex; align-items:center; gap:7px; }
  .btn:hover { opacity:.85; } .btn:active { transform:scale(.97); }
  .btn:disabled { opacity:.35; cursor:not-allowed; }
  .btn-primary { background:var(--accent); color:#fff; }
  .btn-success { background:var(--success); color:#fff; }
  .btn-secondary { background:var(--surface2); color:var(--text); border:1px solid var(--border); }
  .btn-danger { background:var(--danger); color:#fff; }
  .btn-warn { background:var(--warn); color:#000; }

  /* Table */
  table { width:100%; border-collapse:collapse; font-size:.83rem; }
  th { text-align:left; padding:7px 11px; color:var(--muted); font-size:.72rem; letter-spacing:.5px; text-transform:uppercase; border-bottom:1px solid var(--border); }
  td { padding:9px 11px; border-bottom:1px solid rgba(30,45,71,.4); vertical-align:middle; }
  tr:hover td { background:rgba(255,255,255,.02); }

  /* Pills */
  .pill { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:999px; font-size:.72rem; font-weight:700; }

  /* Timeline */
  .timeline { display:flex; flex-direction:column; }
  .tl-item { display:flex; gap:14px; padding-bottom:22px; }
  .tl-item:last-child { padding-bottom:0; }
  .tl-line { display:flex; flex-direction:column; align-items:center; flex-shrink:0; }
  .tl-dot { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.95rem; flex-shrink:0; }
  .tl-track { flex:1; width:2px; background:var(--border); margin-top:4px; }
  .tl-item:last-child .tl-track { display:none; }
  .tl-body { flex:1; padding-top:4px; }
  .tl-status { font-weight:700; font-size:.88rem; }
  .tl-meta { font-size:.75rem; color:var(--muted); font-family:var(--mono); margin-top:2px; }
  .tl-note { font-size:.8rem; margin-top:5px; background:rgba(255,255,255,.04); border-radius:6px; padding:5px 9px; }

  /* Proposal card */
  .proposal-card { background:var(--surface2); border:1px solid var(--border); border-radius:10px; padding:16px; margin-bottom:12px; }
  .proposal-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; }
  .proposal-title { font-weight:700; font-size:.95rem; }
  .proposal-meta { font-size:.75rem; color:var(--muted); font-family:var(--mono); margin-top:3px; }
  .approval-dots { display:flex; gap:6px; margin:10px 0; }
  .approval-dot { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.7rem; font-weight:700; }
  .approval-dot.yes { background:rgba(16,185,129,.2); color:var(--success); border:1.5px solid var(--success); }
  .approval-dot.no  { background:rgba(30,45,71,.5);   color:var(--muted);   border:1.5px solid var(--border); }

  /* Council card */
  .council-card { display:flex; align-items:center; gap:12px; padding:12px 14px; background:var(--surface2); border:1px solid var(--border); border-radius:10px; margin-bottom:8px; }
  .council-idx { width:28px; height:28px; border-radius:50%; background:rgba(99,102,241,.15); color:var(--accent); font-weight:800; font-size:.8rem; display:flex; align-items:center; justify-content:center; flex-shrink:0; }

  /* Setup */
  .setup { padding:32px; }
  .setup-box { background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(139,92,246,.08)); border:1px solid var(--border); border-radius:var(--radius); padding:36px; text-align:center; max-width:560px; margin:0 auto; }
  .setup-box h2 { font-size:1.5rem; font-weight:800; margin-bottom:8px; }
  .setup-box p { color:var(--muted); font-size:.88rem; margin-bottom:20px; line-height:1.6; }

  /* Toast */
  .toast-wrap { position:fixed; bottom:22px; right:22px; display:flex; flex-direction:column; gap:8px; z-index:9999; }
  .toast { padding:11px 18px; border-radius:10px; font-size:.85rem; font-weight:600; max-width:340px; animation:slideIn .2s ease; box-shadow:0 4px 20px rgba(0,0,0,.5); }
  .toast.ok  { background:#064e3b; border:1px solid var(--success); color:#d1fae5; }
  .toast.err { background:#450a0a; border:1px solid var(--danger);  color:#fee2e2; }
  .toast.inf { background:#0c1a2e; border:1px solid var(--accent);  color:#c7d2fe; }
  @keyframes slideIn { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:translateX(0)} }

  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .mono { font-family:var(--mono); font-size:.8rem; }
  .divider { border:none; border-top:1px solid var(--border); margin:18px 0; }
  .info-box { background:rgba(99,102,241,.08); border:1px solid rgba(99,102,241,.2); border-radius:8px; padding:12px 14px; font-size:.83rem; color:#c7d2fe; margin-bottom:16px; line-height:1.6; }
  .warn-box  { background:rgba(245,158,11,.08); border:1px solid rgba(245,158,11,.2); border-radius:8px; padding:12px 14px; font-size:.83rem; color:#fde68a; margin-bottom:16px; line-height:1.6; }
  @media(max-width:640px){ .grid2{grid-template-columns:1fr} .sidebar{display:none} }
`;

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toasts({ toasts }) {
  return <div className="toast-wrap">{toasts.map(t=><div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}</div>;
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [provider, setProvider]       = useState(null);
  const [signer, setSigner]           = useState(null);
  const [account, setAccount]         = useState("");
  const [contract, setContract]       = useState(null);
  const [inputAddr, setInputAddr]     = useState("");
  const [page, setPage]               = useState("dashboard");
  const [loading, setLoading]         = useState(false);
  const [toasts, setToasts]           = useState([]);

  // On-chain state
  const [userRole, setUserRole]         = useState(0);
  const [isCouncil, setIsCouncil]       = useState(false);
  const [isDeployer, setIsDeployer]     = useState(false);
  const [renounced, setRenounced]       = useState(false);
  const [council, setCouncil]           = useState(["","",""]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalProposals, setTotalProposals] = useState(0);
  const [products, setProducts]         = useState([]);
  const [proposals, setProposals]       = useState([]);

  // Form state
  const [newName, setNewName]           = useState("");
  const [newDesc, setNewDesc]           = useState("");
  const [actionId, setActionId]         = useState("");
  const [actionNote, setActionNote]     = useState("");
  const [propTarget, setPropTarget]     = useState("");
  const [propRole, setPropRole]         = useState("1");
  const [trackId, setTrackId]           = useState("");
  const [trackedProduct, setTrackedProduct] = useState(null);
  const [trackedHistory, setTrackedHistory] = useState([]);

  const toast = useCallback((msg, type="ok") => {
    const id = Date.now();
    setToasts(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)), 4500);
  },[]);

  async function connectWallet() {
    if (!window.ethereum) { toast("MetaMask not found","err"); return; }
    try {
      const p = new ethers.BrowserProvider(window.ethereum);
      await p.send("eth_requestAccounts",[]);
      const s = await p.getSigner();
      const a = await s.getAddress();
      setProvider(p); setSigner(s); setAccount(a);
      toast(`Connected: ${shortAddr(a)}`);
    } catch(e){ toast(e.message,"err"); }
  }

  async function loadContract(addr) {
    if (!signer) { toast("Connect wallet first","err"); return; }
    if (!ethers.isAddress(addr)) { toast("Invalid address","err"); return; }
    try {
      const c = new ethers.Contract(addr, CONTRACT_ABI, signer);
      await c.totalProducts(); // sanity check
      setContract(c);
      toast("Contract loaded ✓");
    } catch(e){ toast("Failed to load: "+e.message,"err"); }
  }

  async function refreshAll(c=contract, a=account) {
    if (!c || !a) return;
    try {
      const [role, isCM, deployerAddr, isRenounced, councilArr, tp, tpr] = await Promise.all([
        c.myRole(),
        c.isCouncilMember(a),
        c.deployer(),
        c.deployerRenounced(),
        c.getCouncil(),
        c.totalProducts(),
        c.totalProposals(),
      ]);
      setUserRole(Number(role));
      setIsCouncil(isCM);
      setIsDeployer(deployerAddr.toLowerCase() === a.toLowerCase());
      setRenounced(isRenounced);
      setCouncil([councilArr[0], councilArr[1], councilArr[2]]);
      setTotalProducts(Number(tp));
      setTotalProposals(Number(tpr));

      // Load products
      const pList = [];
      for (let i=1; i<=Math.min(Number(tp),50); i++) {
        try {
          const p = await c.getProduct(i);
          pList.push({ id:Number(p.id), name:p.name, description:p.description, manufacturer:p.manufacturer, createdAt:Number(p.createdAt), status:Number(p.currentStatus) });
        } catch {}
      }
      setProducts(pList);

      // Load proposals
      const prList = [];
      for (let i=1; i<=Math.min(Number(tpr),20); i++) {
        try {
          const [pr, approvals] = await c.getProposalDetails(i);
          prList.push({
            id: Number(pr.id), proposedBy: pr.proposedBy, target: pr.target,
            role: Number(pr.role), approvalCount: Number(pr.approvalCount),
            createdAt: Number(pr.createdAt), executed: pr.executed, expired: pr.expired,
            approvals: [approvals[0], approvals[1], approvals[2]],
          });
        } catch {}
      }
      setProposals(prList);
    } catch(e){ console.error(e); }
  }

  useEffect(() => { if (contract) refreshAll(); }, [contract]);

  // Listen for account change in MetaMask
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.on("accountsChanged", async (accounts) => {
      if (accounts.length === 0) { setAccount(""); setSigner(null); return; }
      const p = new ethers.BrowserProvider(window.ethereum);
      const s = await p.getSigner();
      setSigner(s); setAccount(accounts[0]);
      if (contract) {
        const c = new ethers.Contract(contract.target, CONTRACT_ABI, s);
        setContract(c);
      }
    });
  }, [contract]);

  // ── Friendly error messages ──
  function parseError(e) {
    const raw = e?.reason || e?.message || "Unknown error";

    // Contract revert reasons
    if (raw.includes("wrong role"))         return "❌ Your account does not have the required role for this action.";
    if (raw.includes("invalid transition")) return "❌ Invalid status transition. Make sure the product is at the correct stage before performing this action.";
    if (raw.includes("product not found"))  return "❌ Product not found. Check the Product ID.";
    if (raw.includes("not a council"))      return "❌ Your account is not a council member.";
    if (raw.includes("already approved"))   return "❌ You have already approved this proposal.";
    if (raw.includes("already executed"))   return "❌ This proposal has already been executed.";
    if (raw.includes("proposal expired"))   return "❌ This proposal has expired (7 day limit reached).";
    if (raw.includes("proposal does not"))  return "❌ Proposal not found.";
    if (raw.includes("already renounced"))  return "❌ Deployer has already renounced.";
    if (raw.includes("not deployer"))       return "❌ Only the deployer can call this function.";
    if (raw.includes("name required"))      return "❌ Product name cannot be empty.";
    if (raw.includes("zero address"))       return "❌ Invalid wallet address entered.";
    if (raw.includes("duplicate members"))  return "❌ Council members must all be different addresses.";

    // MetaMask / user errors
    if (raw.includes("user rejected") || raw.includes("User denied")) return "⚠️ Transaction cancelled in MetaMask.";
    if (raw.includes("insufficient funds")) return "❌ Insufficient ETH for gas fees.";
    if (raw.includes("nonce"))              return "❌ Nonce error — reset your MetaMask account in Settings → Advanced → Reset Account.";

    // Generic fallback — show something readable
    if (raw.length > 120) return "❌ Transaction failed. Check that you have the correct role and the product is at the right stage.";
    return "❌ " + raw;
  }

  async function sendTx(fn, ...args) {
    setLoading(true);
    try {
      const tx = await fn(...args);
      toast("Transaction sent…","inf");
      await tx.wait();
      toast("Confirmed ✓");
      await refreshAll();
      return true;
    } catch(e){
      toast(parseError(e), "err");
      return false;
    }
    finally { setLoading(false); }
  }

  // ── Pre-flight checks before sending tx ──
  async function validateProductAction(requiredStatus) {
    if (!actionId) { toast("❌ Please enter a Product ID.","err"); return false; }
    try {
      const p = await contract.getProduct(actionId);
      const current = Number(p.currentStatus);
      if (Array.isArray(requiredStatus) ? !requiredStatus.includes(current) : current !== requiredStatus) {
        const needed = Array.isArray(requiredStatus)
          ? requiredStatus.map(s=>STATUS_LABELS[s]).join(" or ")
          : STATUS_LABELS[requiredStatus];
        toast(`❌ Product is currently "${STATUS_LABELS[current]}". It must be "${needed}" for this action.`, "err");
        return false;
      }
      return true;
    } catch {
      toast("❌ Product not found. Check the Product ID.", "err");
      return false;
    }
  }

  // Actions
  async function handleAddProduct() {
    if (!newName) { toast("❌ Product name is required.","err"); return; }
    const ok = await sendTx(contract.addProduct, newName, newDesc);
    if (ok) { setNewName(""); setNewDesc(""); }
  }
  async function handlePickup() {
    if (!await validateProductAction(0)) return; // must be Created
    await sendTx(contract.pickupFromManufacturer, actionId, actionNote||"Picked up from manufacturer");
  }
  async function handleWarehouse() {
    if (!await validateProductAction(1)) return; // must be InTransit
    await sendTx(contract.storeAtWarehouse, actionId, actionNote||"Stored at warehouse");
  }
  async function handleDispatch() {
    if (!await validateProductAction([1,2])) return; // must be InTransit or AtWarehouse
    await sendTx(contract.dispatchToRetailer, actionId, actionNote||"Dispatched to retailer");
  }
  async function handleReceive() {
    if (!await validateProductAction(3)) return; // must be OutForDelivery
    await sendTx(contract.receiveAtRetailer, actionId, actionNote||"Received at retailer");
  }
  async function handleSell() {
    if (!await validateProductAction(4)) return; // must be AtRetailer
    await sendTx(contract.markAsSold, actionId, actionNote||"Sold to customer");
  }
  async function handleRenounce()  { await sendTx(contract.renounce); }

  async function handlePropose() {
    if (!ethers.isAddress(propTarget)) { toast("Invalid address","err"); return; }
    const ok = await sendTx(contract.proposeRole, propTarget, Number(propRole));
    if (ok) { setPropTarget(""); }
  }
  async function handleApprove(id) { await sendTx(contract.approveProposal, id); }

  async function handleTrack() {
    if (!contract || !trackId) return;
    setLoading(true);
    try {
      const [p, h] = await Promise.all([contract.getProduct(trackId), contract.getProductHistory(trackId)]);
      setTrackedProduct({ id:Number(p.id), name:p.name, description:p.description, manufacturer:p.manufacturer, createdAt:Number(p.createdAt), status:Number(p.currentStatus) });
      setTrackedHistory(h.map(e=>({ status:Number(e.status), updatedBy:e.updatedBy, timestamp:Number(e.timestamp), note:e.note })));
    } catch(e){ toast("❌ Product not found. Check the Product ID.","err"); setTrackedProduct(null); setTrackedHistory([]); }
    finally { setLoading(false); }
  }

  // ─── Shared components ────────────────────────────────────────────────────
  function StatusPill({ status }) {
    return <span className="pill" style={{ background:STATUS_COLORS[status]+"22", color:STATUS_COLORS[status] }}>{STATUS_ICONS[status]} {STATUS_LABELS[status]}</span>;
  }
  function RoleBadge({ role }) {
    return <span className="role-badge" style={{ background:ROLE_COLORS[role]+"22", color:ROLE_COLORS[role] }}>{ROLE_ICONS[role]} {ROLE_NAMES[role]}</span>;
  }

  // ─── Pages ────────────────────────────────────────────────────────────────
  function PageDashboard() {
    return <>
      <div className="stats">
        <div className="stat"><div className="stat-val" style={{color:"var(--accent)"}}>{totalProducts}</div><div className="stat-lbl">Total Products</div></div>
        <div className="stat"><div className="stat-val" style={{color:ROLE_COLORS[userRole]}}>{ROLE_ICONS[userRole]}</div><div className="stat-lbl">Your Role: {ROLE_NAMES[userRole]}</div></div>
        <div className="stat"><div className="stat-val" style={{color:"var(--accent2)"}}>{proposals.filter(p=>!p.executed&&!p.expired).length}</div><div className="stat-lbl">Active Proposals</div></div>
        <div className="stat"><div className="stat-val mono" style={{fontSize:".95rem",paddingTop:6}}>{shortAddr(account)}</div><div className="stat-lbl">Your Wallet</div></div>
      </div>

      {/* Council info */}
      <div className="card">
        <div className="card-title">🏛️ Governance Council</div>
        <div className="info-box">
          This system is governed by a <strong>2-of-3 multi-signature council</strong>. Any role assignment requires approval from at least 2 council members. No single entity has full control.
        </div>
        {council.map((addr,i)=>(
          <div className="council-card" key={i}>
            <div className="council-idx">{i+1}</div>
            <div>
              <div style={{fontWeight:700,fontSize:".88rem"}}>{COUNCIL_LABELS[i]}</div>
              <div className="mono" style={{color:"var(--accent)",marginTop:2}}>{addr}</div>
            </div>
            {addr.toLowerCase()===account.toLowerCase() && <span className="pill" style={{marginLeft:"auto",background:"rgba(99,102,241,.15)",color:"var(--accent)"}}>You</span>}
          </div>
        ))}
        {!renounced && isDeployer && (
          <div className="warn-box" style={{marginTop:12,marginBottom:0}}>
            ⚠️ You are the deployer and have not yet renounced. Go to the <strong>Governance</strong> page to renounce your power and hand control to the council.
          </div>
        )}
        {renounced && <div className="info-box" style={{marginTop:12,marginBottom:0}}>✅ Deployer has renounced. System is fully governed by the council.</div>}
      </div>

      {/* Products table */}
      <div className="card">
        <div className="card-title">📦 All Products</div>
        {products.length===0
          ? <p style={{color:"var(--muted)",fontSize:".88rem"}}>No products registered yet.</p>
          : <table>
              <thead><tr><th>ID</th><th>Name</th><th>Manufacturer</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>{products.map(p=>(
                <tr key={p.id}>
                  <td className="mono">#{p.id}</td>
                  <td style={{fontWeight:600}}>{p.name}</td>
                  <td className="mono">{shortAddr(p.manufacturer)}</td>
                  <td><StatusPill status={p.status}/></td>
                  <td className="mono" style={{color:"var(--muted)",fontSize:".72rem"}}>{formatTime(p.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table>
        }
        <button className="btn btn-secondary" style={{marginTop:14}} onClick={()=>refreshAll()} disabled={loading}>🔄 Refresh</button>
      </div>
    </>;
  }

  function PageGovernance() {
    const activeProposals = proposals.filter(p=>!p.executed&&!p.expired);
    const pastProposals   = proposals.filter(p=>p.executed||p.expired);
    return <>
      {/* Renounce */}
      {isDeployer && !renounced && (
        <div className="card" style={{borderColor:"rgba(245,158,11,.3)"}}>
          <div className="card-title">⚠️ Deployer: Renounce Ownership</div>
          <div className="warn-box">
            You deployed this contract. As per the governance model, you should renounce your deployer privileges after setting up the council. This is <strong>irreversible</strong>.
          </div>
          <button className="btn btn-warn" onClick={handleRenounce} disabled={loading}>
            {loading ? "⏳ Processing…" : "🔓 Renounce Deployer Power"}
          </button>
        </div>
      )}

      {/* Propose */}
      {isCouncil && (
        <div className="card">
          <div className="card-title">🗳️ Propose Role Assignment</div>
          <div className="info-box">As a council member, you can propose assigning a role to any address. A second council member must approve before it takes effect.</div>
          <div className="grid2">
            <div className="field">
              <label>Wallet Address</label>
              <input value={propTarget} onChange={e=>setPropTarget(e.target.value)} placeholder="0x…" />
            </div>
            <div className="field">
              <label>Role to Assign</label>
              <select value={propRole} onChange={e=>setPropRole(e.target.value)}>
                <option value="1">🏭 Manufacturer</option>
                <option value="2">🚛 Distributor</option>
                <option value="3">🏪 Retailer</option>
                <option value="4">👤 Customer</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handlePropose} disabled={loading||!contract}>
            {loading ? "⏳ Submitting…" : "📋 Create Proposal"}
          </button>
        </div>
      )}

      {/* Active proposals */}
      <div className="card">
        <div className="card-title">📋 Active Proposals ({activeProposals.length})</div>
        {activeProposals.length===0
          ? <p style={{color:"var(--muted)",fontSize:".88rem"}}>No active proposals.</p>
          : activeProposals.map(p=>(
            <div className="proposal-card" key={p.id}>
              <div className="proposal-header">
                <div>
                  <div className="proposal-title">Proposal #{p.id} — Assign <RoleBadge role={p.role}/></div>
                  <div className="proposal-meta">To: {p.target}</div>
                  <div className="proposal-meta">Proposed by: {shortAddr(p.proposedBy)} · {timeLeft(p.createdAt)}</div>
                </div>
                <span className="pill" style={{background:"rgba(99,102,241,.15)",color:"var(--accent)"}}>
                  {p.approvalCount}/2 approvals
                </span>
              </div>
              <div className="approval-dots">
                {council.map((addr,i)=>(
                  <div key={i} className={`approval-dot ${p.approvals[i]?"yes":"no"}`} title={COUNCIL_LABELS[i]}>
                    {p.approvals[i]?"✓":"?"}
                  </div>
                ))}
                <span style={{fontSize:".75rem",color:"var(--muted)",alignSelf:"center",marginLeft:4}}>
                  {council.map((a,i)=>`${p.approvals[i]?"✓":"✗"} ${COUNCIL_LABELS[i]}`).join(" · ")}
                </span>
              </div>
              {isCouncil && !p.approvals[council.findIndex(a=>a.toLowerCase()===account.toLowerCase())] && (
                <button className="btn btn-success" onClick={()=>handleApprove(p.id)} disabled={loading} style={{marginTop:4}}>
                  ✅ Approve
                </button>
              )}
            </div>
          ))
        }
      </div>

      {/* Past proposals */}
      {pastProposals.length>0 && (
        <div className="card">
          <div className="card-title">📁 Past Proposals</div>
          <table>
            <thead><tr><th>ID</th><th>Target</th><th>Role</th><th>Status</th><th>Approvals</th></tr></thead>
            <tbody>{pastProposals.map(p=>(
              <tr key={p.id}>
                <td className="mono">#{p.id}</td>
                <td className="mono">{shortAddr(p.target)}</td>
                <td><RoleBadge role={p.role}/></td>
                <td>
                  {p.executed
                    ? <span className="pill" style={{background:"rgba(16,185,129,.15)",color:"var(--success)"}}>✅ Executed</span>
                    : <span className="pill" style={{background:"rgba(239,68,68,.15)",color:"var(--danger)"}}>⏰ Expired</span>
                  }
                </td>
                <td className="mono">{p.approvalCount}/2</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>;
  }

  function PageManufacturer() {
    return <div className="card">
      <div className="card-title">🏭 Register New Product</div>
      {userRole!==1 && <div className="warn-box">⚠️ You need the <strong>Manufacturer</strong> role to add products. Contact a council member to assign you this role via the Governance page.</div>}
      <div className="grid2">
        <div className="field"><label>Product Name *</label><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Nike Air Max" /></div>
        <div className="field"><label>Description</label><input value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="Optional details" /></div>
      </div>
      <button className="btn btn-primary" onClick={handleAddProduct} disabled={loading||!contract||userRole!==1}>
        {loading?"⏳ Submitting…":"➕ Add Product"}
      </button>
    </div>;
  }

  function PageDistributor() {
    return <div className="card">
      <div className="card-title">🚛 Distributor Actions</div>
      {userRole!==2 && <div className="warn-box">⚠️ You need the <strong>Distributor</strong> role to perform these actions.</div>}
      <div className="grid2">
        <div className="field"><label>Product ID</label><input type="number" value={actionId} onChange={e=>setActionId(e.target.value)} placeholder="e.g. 1" /></div>
        <div className="field"><label>Note</label><input value={actionNote} onChange={e=>setActionNote(e.target.value)} placeholder="Optional note" /></div>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button className="btn btn-primary"   onClick={handlePickup}    disabled={loading||!contract||userRole!==2}>🚚 Pickup from Manufacturer</button>
        <button className="btn btn-secondary" onClick={handleWarehouse} disabled={loading||!contract||userRole!==2}>🏭 Store at Warehouse</button>
        <button className="btn btn-secondary" onClick={handleDispatch}  disabled={loading||!contract||userRole!==2}>🚀 Dispatch to Retailer</button>
      </div>
    </div>;
  }

  function PageRetailer() {
    return <div className="card">
      <div className="card-title">🏪 Retailer Actions</div>
      {userRole!==3 && <div className="warn-box">⚠️ You need the <strong>Retailer</strong> role to perform these actions.</div>}
      <div className="grid2">
        <div className="field"><label>Product ID</label><input type="number" value={actionId} onChange={e=>setActionId(e.target.value)} placeholder="e.g. 1" /></div>
        <div className="field"><label>Note</label><input value={actionNote} onChange={e=>setActionNote(e.target.value)} placeholder="Optional note" /></div>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button className="btn btn-primary"   onClick={handleReceive} disabled={loading||!contract||userRole!==3}>📥 Receive at Retailer</button>
        <button className="btn btn-success"   onClick={handleSell}    disabled={loading||!contract||userRole!==3}>✅ Mark as Sold</button>
      </div>
    </div>;
  }

  function PageTrack() {
    return <>
      <div className="card">
        <div className="card-title">🔍 Track & Verify Product</div>
        <div className="info-box">Anyone can track a product — no wallet or account needed. Enter a Product ID to see its complete blockchain history.</div>
        <div style={{display:"flex",gap:10}}>
          <div className="field" style={{flex:1,marginBottom:0}}>
            <input type="number" value={trackId} onChange={e=>setTrackId(e.target.value)} placeholder="Enter Product ID (e.g. 1)" />
          </div>
          <button className="btn btn-primary" onClick={handleTrack} disabled={loading||!contract}>
            {loading?"⏳":"🔍 Track"}
          </button>
        </div>
      </div>

      {trackedProduct && <>
        <div className="card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
            <div>
              <div style={{fontSize:"1.2rem",fontWeight:800}}>#{trackedProduct.id} — {trackedProduct.name}</div>
              {trackedProduct.description && <div style={{color:"var(--muted)",fontSize:".85rem",marginTop:3}}>{trackedProduct.description}</div>}
            </div>
            <StatusPill status={trackedProduct.status}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:".8rem",marginBottom:20}}>
            <div><span style={{color:"var(--muted)"}}>Manufacturer: </span><span className="mono">{trackedProduct.manufacturer}</span></div>
            <div><span style={{color:"var(--muted)"}}>Registered: </span><span className="mono">{formatTime(trackedProduct.createdAt)}</span></div>
          </div>
          <hr className="divider"/>
          <div className="card-title" style={{marginBottom:14}}>📜 Blockchain History</div>
          <div className="timeline">
            {trackedHistory.map((h,i)=>(
              <div className="tl-item" key={i}>
                <div className="tl-line">
                  <div className="tl-dot" style={{background:STATUS_COLORS[h.status]+"22",border:`2px solid ${STATUS_COLORS[h.status]}`}}>{STATUS_ICONS[h.status]}</div>
                  <div className="tl-track"/>
                </div>
                <div className="tl-body">
                  <div className="tl-status" style={{color:STATUS_COLORS[h.status]}}>{STATUS_LABELS[h.status]}</div>
                  <div className="tl-meta">{formatTime(h.timestamp)} · {shortAddr(h.updatedBy)}</div>
                  {h.note && <div className="tl-note">{h.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>}
    </>;
  }

  // ─── Setup screen ─────────────────────────────────────────────────────────
  function Setup() {
    return <div className="setup">
      <div className="setup-box">
        <div style={{fontSize:"2.5rem",marginBottom:12}}>🔗</div>
        <h2>Connect to BlockTrace</h2>
        <p>Connect your MetaMask wallet and enter the deployed smart contract address to access the supply chain system.</p>
        {!account
          ? <button className="btn btn-primary" onClick={connectWallet}>Connect MetaMask</button>
          : <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
              <div className="mono" style={{color:"var(--success)"}}>✓ {account}</div>
              <div style={{display:"flex",gap:10,width:"100%"}}>
                <input style={{flex:1,padding:"9px 13px",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text)",fontFamily:"var(--mono)",fontSize:".85rem",outline:"none"}}
                  placeholder="Contract address (0x…)" value={inputAddr} onChange={e=>setInputAddr(e.target.value)} />
                <button className="btn btn-primary" onClick={()=>loadContract(inputAddr)} disabled={loading}>Load</button>
              </div>
              <p style={{fontSize:".78rem",color:"var(--muted)"}}>Deploy <code style={{color:"var(--accent)"}}>SupplyChain.sol</code> on Remix with your 3 council addresses as constructor arguments, then paste the contract address above.</p>
            </div>
        }
      </div>
    </div>;
  }

  const navItems = [
    { id:"dashboard",    label:"Dashboard",    icon:"📊" },
    { id:"governance",   label:"Governance",   icon:"🏛️", badge: proposals.filter(p=>!p.executed&&!p.expired).length||null },
    { id:"manufacturer", label:"Manufacturer", icon:"🏭" },
    { id:"distributor",  label:"Distributor",  icon:"🚛" },
    { id:"retailer",     label:"Retailer",     icon:"🏪" },
    { id:"track",        label:"Track Product",icon:"🔍" },
  ];

  return <>
    <style>{css}</style>
    <div className="app">
      <header className="header">
        <div className="logo">
          <div className="logo-icon">🔗</div>
          Block<span>Trace</span>
        </div>
        <div className="hdr-right">
          {contract && <RoleBadge role={userRole}/>}
          {contract && isCouncil && <span className="pill" style={{background:"rgba(99,102,241,.15)",color:"var(--accent)",fontSize:".72rem"}}>🏛️ Council</span>}
          <div className="wallet-pill" onClick={connectWallet}>
            <div className={`dot ${account?"on":"off"}`}/>
            {account ? shortAddr(account) : "Connect Wallet"}
          </div>
        </div>
      </header>

      <div className="main">
        <nav className="sidebar">
          <div className="nav-section">Navigation</div>
          {navItems.map(n=>(
            <div key={n.id} className={`nav-item ${page===n.id?"active":""}`} onClick={()=>setPage(n.id)}>
              <span>{n.icon}</span> {n.label}
              {n.badge ? <span className="nav-badge">{n.badge}</span> : null}
            </div>
          ))}
        </nav>

        <main className="content">
          {!contract
            ? <Setup/>
            : page==="dashboard"    ? <PageDashboard/>
            : page==="governance"   ? <PageGovernance/>
            : page==="manufacturer" ? <PageManufacturer/>
            : page==="distributor"  ? <PageDistributor/>
            : page==="retailer"     ? <PageRetailer/>
            : page==="track"        ? <PageTrack/>
            : null
          }
        </main>
      </div>
    </div>
    <Toasts toasts={toasts}/>
  </>;
}
