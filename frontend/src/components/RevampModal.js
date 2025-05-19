import React, { useState, useEffect } from "react";
import { BrowserProvider, Contract, parseUnits, formatUnits } from "ethers";
import { DEFI_ADDRESSES } from "../constants";
import FluviaABI from "../abis/FluviaDeFi.json";
import { Form, Button, Modal, Spinner, Alert } from "react-bootstrap";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) external returns (bool)"
];

export default function RevampModal({
  isOpen,
  onClose,
  selectedNetwork,
  listedAssets,
  onDepositSuccess
}) {
  // --- State ---
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [tokenAmount, setTokenAmount] = useState("");
  const [nativeAmount, setNativeAmount] = useState("");
  const [tokenBalance, setTokenBalance] = useState("0");
  const [nativeBalance, setNativeBalance] = useState("0");
  const [walletAssets, setWalletAssets] = useState([]);
  const [connectedAccount, setConnectedAccount] = useState(null);

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [transactionHash, setTransactionHash] = useState(null);
  const [showTxModal, setShowTxModal] = useState(false);

  // --- Reset on open ---
  useEffect(() => {
    if (isOpen) {
      setSelectedAsset(null);
      setTokenAmount(""); setNativeAmount("");
      setTokenBalance("0"); setNativeBalance("0");
      setWalletAssets([]); setConnectedAccount(null);
      setAgreeTerms(false); setShowTerms(false);
      setIsProcessing(false);
      setTransactionHash(null); setShowTxModal(false);
    }
  }, [isOpen]);

  // --- Load wallet assets ---
  useEffect(() => {
    async function fetchWalletAssets() {
      if (!isOpen || !selectedNetwork || !window.ethereum) return;
      try {
        const provider = new BrowserProvider(window.ethereum);
        const [acct] = await provider.send("eth_accounts", []);
        if (!acct) return;
        setConnectedAccount(acct);

        const assets = listedAssets.filter(a => a.networkName === selectedNetwork.label);
        const assetsWithBal = [];
        for (const asset of assets) {
          const c = new Contract(asset.tokenAddress, ERC20_ABI, provider);
          const bal = await c.balanceOf(acct);
          if (parseFloat(formatUnits(bal, asset.decimals || 18)) > 0) assetsWithBal.push(asset);
        }
        setWalletAssets(assetsWithBal);
      } catch (e) { console.error(e); }
    }
    fetchWalletAssets();
  }, [isOpen, selectedNetwork, listedAssets]);

  // --- Asset change: refresh balances ---
  async function handleAssetChange(addr) {
    const asset = listedAssets.find(a => a.tokenAddress === addr);
    setSelectedAsset(asset); setTokenAmount(""); setNativeAmount("");
    if (!asset || !window.ethereum) return;

    const provider = new BrowserProvider(window.ethereum);
    const [acct] = await provider.send("eth_accounts", []);
    if (!acct) return;
    setConnectedAccount(acct);

    await provider.send("wallet_switchEthereumChain",
      [{ chainId: "0x" + selectedNetwork.chainId.toString(16) }]);

    const tokC = new Contract(addr, ERC20_ABI, provider);
    setTokenBalance(formatUnits(await tokC.balanceOf(acct), asset.decimals || 18));
    setNativeBalance(formatUnits(await provider.getBalance(acct), 18));
  }

  // --- Amount helpers ---
  const onTokenAmountChange = v => {
    setTokenAmount(v);
    setNativeAmount(selectedAsset && v ? (parseFloat(v) * selectedAsset.rate).toFixed(6) : "");
  };
  const onNativeAmountChange = v => {
    setNativeAmount(v);
    setTokenAmount(selectedAsset && v ? (parseFloat(v) / selectedAsset.rate).toFixed(6) : "");
  };

  // --- Confirm (deposit) ---
  async function handleConfirm() {
    if (!selectedAsset) return alert("Select an asset first.");
    if (!tokenAmount || !nativeAmount) return alert("Enter both amounts.");
    if (!agreeTerms) return alert("You must agree to the terms.");
    setIsProcessing(true);

    try {
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("wallet_switchEthereumChain",
        [{ chainId: "0x" + selectedNetwork.chainId.toString(16) }]);
      const signer = await provider.getSigner();
      const acct = await signer.getAddress();
      const contractAddr = DEFI_ADDRESSES[selectedNetwork.chainId];
      if (!contractAddr) throw new Error("No contract on this chain.");

      const tokC = new Contract(selectedAsset.tokenAddress, ERC20_ABI, signer);
      const needed = parseUnits(tokenAmount, selectedAsset.decimals || 18);
      if (await tokC.allowance(acct, contractAddr) < needed) {
        await (await tokC.approve(contractAddr, needed)).wait();
      }

      const core = new Contract(contractAddr, FluviaABI, signer);
      const value = parseUnits(nativeAmount, 18);
      const tx = await core.deposit(selectedAsset.tokenAddress, needed, { value });
      await tx.wait();

      setTransactionHash(tx.hash); setShowTxModal(true);
      onDepositSuccess?.(tx.hash);
    } catch (e) {
      console.error(e);
      alert("Transaction failed or canceled.");
    } finally { setIsProcessing(false); }
  }

  const closeTxModal = () => { setShowTxModal(false); setTransactionHash(null); onClose(); };
  const explorerLink = transactionHash && selectedNetwork
    ? `${selectedNetwork.explorerUrl}/tx/${transactionHash}` : "#";

  // --- Render ---
  return (
    <>
      {/* ===================== Main modal ===================== */}
      <Modal show={isOpen} onHide={onClose} centered dialogClassName="revamp-modal-dialog" contentClassName="revamp-modal" backdropClassName="revamp-modal-backdrop">
        <Modal.Header closeButton style={{
          background: "transparent",
          borderBottom: "none",
          padding: "1.4rem 2.1rem 0.4rem 2.1rem",
          alignItems: "flex-end"
        }}>
          <div className="w-100">
            <h2 style={{
              fontWeight: 600,
              fontSize: "1.32rem",
              letterSpacing: ".03em",
              color: "var(--rvnwl-accent-cyan)",
              marginBottom: 0,
              textTransform: "uppercase"
            }}>
              Revamp (Deposit & Burn)
            </h2>
            <div style={{
              height: 3,
              width: "100%",
              background: "linear-gradient(90deg, var(--rvnwl-accent-cyan) 35%, transparent 100%)",
              marginTop: 10,
              borderRadius: 2
            }} />
          </div>
        </Modal.Header>

        <Modal.Body style={{ padding: "2.1rem 2.1rem 1.6rem 2.1rem", position: "relative" }}>
          {isProcessing && (
            <div className="processing-overlay">
              <Spinner animation="border" variant="primary" />
              <p className="mt-2 processing-text">Processing…</p>
            </div>
          )}

          <div className="mb-2" style={{ fontSize: "1.07rem" }}>
            <span className="fw-normal" style={{ color: "var(--rvnwl-accent-cyan)" }}>
              Network:
            </span>
            <span style={{ color: "var(--card-text)", fontWeight: 600, marginLeft: 7 }}>
              {selectedNetwork?.label ?? "—"}{" "}
              <span style={{ color: "#7982a7", fontWeight: 500, fontSize: "0.96em" }}>
                (Chain {selectedNetwork?.chainId ?? "?"})
              </span>
            </span>
          </div>

          {/* Asset selector */}
          <Form.Group className="mb-4">
            <Form.Label style={{ fontWeight: 500, color: "var(--rvnwl-accent-cyan)" }}>
              Select Asset
            </Form.Label>
            <Form.Select
              value={selectedAsset?.tokenAddress || ""}
              onChange={e => handleAssetChange(e.target.value)}
              disabled={isProcessing}
              className="glass-input"
            >
              <option value="">— Choose an Asset —</option>
              {walletAssets.map(a => (
                <option key={a.tokenAddress} value={a.tokenAddress}>
                  {a.tokenName} ({a.tokenSymbol}) — Rate: {a.rate}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          {/* balances */}
          {connectedAccount && (
            <Alert variant="secondary" className="py-1 mb-3 small" style={{ borderRadius: 8 }}>
              <span style={{ color: "var(--rvnwl-accent-dark)" }}>
                Token Balance:
              </span>{" "}
              <span style={{ fontWeight: 500 }}>
                {Number(tokenBalance).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
              </span>
              <span style={{ margin: "0 14px" }}><br /></span>
              <span style={{ color: "var(--rvnwl-accent-dark)" }}>
                Native Balance:
              </span>{" "}
              <span style={{ fontWeight: 500 }}>
                {Number(nativeBalance).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
              </span>
            </Alert>
          )}


          {/* amount inputs */}
          <Form.Group className="mb-4">
            <Form.Label style={{ fontWeight: 500, color: "var(--rvnwl-accent-cyan)" }}>
              Token Amount (illiquid)
            </Form.Label>
            <Form.Control
              type="number" value={tokenAmount}
              onChange={e => onTokenAmountChange(e.target.value)}
              disabled={isProcessing}
              className="glass-input"
            />
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label style={{ fontWeight: 500, color: "var(--rvnwl-accent-cyan)" }}>
              Native Amount (revamp)
            </Form.Label>
            <Form.Control
              type="number" value={nativeAmount}
              onChange={e => onNativeAmountChange(e.target.value)}
              disabled={isProcessing}
              className="glass-input"
            />
          </Form.Group>

          {tokenAmount && nativeAmount && (
            <div className="small mb-2" style={{ color: "#8fe3e1", fontWeight: 500 }}>
              1 {selectedAsset?.tokenSymbol || "token"} = {selectedAsset?.rate || "—"} {selectedNetwork?.currency}
            </div>
          )}

          {/* agree to terms */}
          <Form.Group className="d-flex align-items-center mb-2 mt-3">
            <Form.Check
              type="checkbox"
              disabled={isProcessing}
              checked={agreeTerms}
              onChange={() => setAgreeTerms(v => !v)}
              className="me-2"
              inline
            />
            <Form.Label className="mb-0" style={{ fontSize: "1.01rem" }}>
              I agree to the{" "}
              <Button
                variant="link"
                size="sm"
                className="p-0 align-baseline"
                onClick={() => setShowTerms(true)}
                disabled={isProcessing}
                style={{
                  color: "var(--rvnwl-accent-cyan)",
                  textDecoration: "underline"
                }}
              >
                revamp T&C.
              </Button>
            </Form.Label>
          </Form.Group>
        </Modal.Body>

        <Modal.Footer style={{ borderTop: "none", background: "transparent", padding: "1.1rem 2.2rem 1.7rem 2.2rem" }}>
          <Button
            variant="outline-secondary"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-2"
            style={{ fontWeight: 500, fontSize: "1.03rem" }}
          >
            Cancel
          </Button>
          <Button
            variant="success"
            onClick={handleConfirm}
            disabled={!connectedAccount || !agreeTerms || isProcessing}
            className="px-4 py-2 rounded-2"
            style={{ fontWeight: 600, fontSize: "1.08rem", boxShadow: "0 2px 8px 0 rgba(0,255,180,.14)" }}
          >
            {isProcessing ? <Spinner animation="border" size="sm" /> : "Confirm"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ===================== Success overlay ===================== */}
      {showTxModal && transactionHash && (
        <Modal show centered dialogClassName="revamp-modal-dialog" contentClassName="revamp-modal" onHide={closeTxModal}>
          <Modal.Header closeButton>
            <Modal.Title className="text-success fw-normal">
              Transaction Confirmed
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="text-center">
            <div className="mb-3">
              <span className="fw-semibold" style={{ color: "var(--rvnwl-accent-cyan)", fontSize: "1.07rem" }}>
                Your transaction was mined!
              </span>
            </div>
            <div>
              <span className="small text-muted">Tx Hash:</span>
              <br />
              <a
                href={explorerLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--rvnwl-accent-cyan)", wordBreak: "break-all", fontSize: "0.98rem" }}
              >
                {transactionHash.slice(0, 12)}…{transactionHash.slice(-12)}
              </a>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="success" onClick={closeTxModal}>Close</Button>
          </Modal.Footer>
        </Modal>
      )}

      {/* ===================== Terms modal ===================== */}
      <Modal show={showTerms} onHide={() => setShowTerms(false)} centered dialogClassName="revamp-modal-dialog tandc-modal" contentClassName="revamp-modal tandc-modal" backdropClassName="tandc-modal-backdrop">
        <Modal.Header closeButton>
          <Modal.Title>Terms & Conditions</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ul className="small mb-0">
            <li>Smart-contract interactions are irreversible once confirmed.</li>
            <li>No guarantees are provided regarding token prices or liquidity.</li>
            <li>This UI does not constitute financial advice.</li>
            <li>
              Full docs:&nbsp;
              <a href="https://docs.revya.io" target="_blank" rel="noopener noreferrer">
                docs.revya.io
              </a>
            </li>
            <li>
              Source code:&nbsp;
              <a href="https://github.com/revya/protocol" target="_blank" rel="noopener noreferrer">
                GitHub repo
              </a>
            </li>
          </ul>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowTerms(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
