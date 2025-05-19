import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  Container,
  Card,
  Button,
  Modal,
  Alert,
  Form,
  Spinner
} from "react-bootstrap";
import { Pie, Line } from "react-chartjs-2";
import { useNavigate } from "react-router-dom";
import {
  BrowserProvider,
  Contract,
  Interface,
  id,
  formatEther,
  parseEther
} from "ethers";
import openShareABI from "../abis/OpenShareABI.json";
import {
  AVAILABLE_NETWORKS,
  SHAREHOLDING_ADDRESSES
} from "../constants";
import {
  Chart,
  ArcElement,
  LinearScale,
  CategoryScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  BarElement,
  BarController
} from "chart.js";
Chart.register(
  ArcElement,
  LinearScale,
  CategoryScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  BarElement,
  BarController
);

const iface = new Interface(openShareABI);
const PRICE_TOPIC0 = id("PriceHistory(uint256,uint256,uint256)");

export default function ShareholdingDashboard({ signer, selectedNetwork }) {
  const navigate = useNavigate();
  const [currentChain, setCurrentChain] = useState(null);
  const [chainOk, setChainOk] = useState(true);
  useEffect(() => {
    async function checkChain() {
      if (!window.ethereum) {
        setCurrentChain(null); setChainOk(false); return;
      }
      try {
        const hex = await window.ethereum.request({ method: "eth_chainId" });
        const chainId = parseInt(hex, 16);
        const net = AVAILABLE_NETWORKS.find((n) => n.chainId === chainId) || null;
        setCurrentChain(net);
        setChainOk(
          selectedNetwork != null &&
          net != null &&
          net.chainId === selectedNetwork.chainId
        );
      } catch { setCurrentChain(null); setChainOk(false); }
    }
    checkChain();
    window.ethereum?.on("chainChanged", checkChain);
    return () => window.ethereum?.removeListener("chainChanged", checkChain);
  }, [selectedNetwork]);
  const hardRefresh = () => { navigate("/shareholding"); window.location.reload(); };

  const contractAddress = useMemo(
    () => SHAREHOLDING_ADDRESSES[currentChain?.chainId] ?? null,
    [currentChain]
  );
  const contract = useMemo(
    () => signer && contractAddress
      ? new Contract(contractAddress, openShareABI, signer) : null,
    [signer, contractAddress]
  );
  const priceHistoryScrollRef = useRef(null);

  // --- State
  const [historicalData, setHistoricalData] = useState([]);
  const [globalStats, setGlobalStats] = useState({
    currentPrice: "0", lastPurchasePrice: "0",
    totalVolumePurchased: "0", totalHolders: "0"
  });
  const [userStats, setUserStats] = useState({
    userShares: "0", userSalesRewards: "0", userSystemRewards: "0"
  });
  
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [nativeSpend, setNativeSpend] = useState("");
  const [walletBal, setWalletBal] = useState("0");
  const [estShares, setEstShares] = useState("");
  const [agreeTC, setAgreeTC] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [showTxModal, setShowTxModal] = useState(false);
  const closeTxModal = () => { setShowTxModal(false); setTxHash(null); };


const priceLabels = historicalData.map(d =>
  new Date(d.timestamp * 1000).toLocaleDateString()
);
const priceData = historicalData.map(d => d.price);
const volumeData = historicalData.map(d => d.volume);

  // Data loaders
  const fetchGlobal = useCallback(async () => {
    if (!contract) return;
    const [cur, last, vol, holders] = await contract.getGlobalStats();
    setGlobalStats({
      currentPrice: formatEther(cur),
      lastPurchasePrice: formatEther(last),
      totalVolumePurchased: formatEther(vol),
      totalHolders: holders.toString()
    });
  }, [contract]);

  const fetchUser = useCallback(async () => {
    if (!contract) return;
    const addr = await signer.getAddress();
    const [shares, sales, sys] = await contract.getUserStats(addr);
    setUserStats({
      userShares: formatEther(shares),
      userSalesRewards: formatEther(sales),
      userSystemRewards: formatEther(sys)
    });
  }, [contract, signer]);

  const PAGE = 5000;
  const BLOCKS_PER_DAY = 6500;   // Polygon
  const LOOKBACK_DAYS = 90;      // Or any period you want
  
  const loadHistory = useCallback(async () => {
    if (!contract) return;
    setHistoryLoading(true);
    try {
      // 1. Fetch the contract's deployment block
      let deploymentBlock = 0;
      try {
        deploymentBlock = Number(await contract.startBlock());
      } catch {}
      // 2. Get latest block
      const provider = new BrowserProvider(window.ethereum, "any");
      const latest = await provider.getBlockNumber();
      // 3. Calculate fromBlock: either deploymentBlock or lookbackDays ago, whichever is greater
      const earliest = Math.max(latest - BLOCKS_PER_DAY * LOOKBACK_DAYS, deploymentBlock);
      // 4. Log for debug
      console.log("Fetching logs from", earliest, "to", latest);
      // 5. Fetch in pages
      const ranges = [];
      for (let from = earliest; from <= latest; from += PAGE) {
        ranges.push([from, Math.min(from + PAGE - 1, latest)]);
      }
      const contractAddress = contract.target || contract.address;
      const results = await Promise.all(ranges.map(([from, to]) =>
        provider.getLogs({
          address: contractAddress,
          topics: [PRICE_TOPIC0],
          fromBlock: from,
          toBlock: to
        })
      ));
      const logs = results.flat();
      const out = [];
      logs.forEach(log => {
        const { args } = iface.parseLog(log);
        out.push({
          timestamp: Number(args.timestamp),
          price: parseFloat(formatEther(args.price)),
          volume: parseFloat(formatEther(args.volume))
        });
      });
      out.sort((a, b) => a.timestamp - b.timestamp);
      setHistoricalData(out);
    } catch (err) {
      console.error("Error loading history:", err);
    }
    setHistoryLoading(false);
  }, [contract]);
  

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (contract && chainOk) {
        try {
          await Promise.all([
            fetchGlobal(),
            fetchUser(),
            (async () => {
              const addr = await signer.getAddress();
              const bal = await signer.provider.getBalance(addr);
              setWalletBal(formatEther(bal));
            })()
          ]);
        } catch (err) {
          console.error("dashboard-load:", err);
        }
      }
      setLoading(false);
    })();
  }, [contract, chainOk, fetchGlobal, fetchUser, loadHistory, signer]);

  // Handlers
  const onSpend = (v) => {
    setNativeSpend(v);
    const p = parseFloat(globalStats.currentPrice);
    setEstShares(v && p ? (parseFloat(v) / p).toFixed(4) : "");
  };
  const buy = async () => {
    if (!nativeSpend || !agreeTC) return alert("Fill amount & agree T&C");
    if (parseFloat(nativeSpend) > parseFloat(walletBal))
      return alert("Insufficient balance");
    setProcessing(true);
    try {
      const tx = await contract.buyShares({ value: parseEther(nativeSpend) });
      await tx.wait();
      setTxHash(tx.hash); setShowTxModal(true);
      await fetchGlobal(); await fetchUser(); await loadHistory();
      setShowBuy(false);
    } catch (err) {
      console.error(err); alert("Purchase failed or cancelled");
    } finally {
      setProcessing(false); setNativeSpend("");
    }
  };
  const claim = async () => {
    setProcessing(true);
    try {
      const tx = await contract.claimRewards();
      await tx.wait();
      await fetchUser();
      setShowClaim(false);
    } catch (err) {
      console.error(err); alert("Claim failed");
    } finally {
      setProcessing(false);
    }
  };

  // Chart data
  const userShare = parseFloat(userStats.userShares) || 0;
  const restShare = Math.max(100 - userShare, 0);

  const pieData = {
    labels: ["You", "Others"],
    datasets: [
      {
        data: [userShare, restShare],
        backgroundColor: [
          "#ff5c1e",  // "You" — vibrant orange
          "#26ffe3"   // "Others" — neon cyan
        ],
        borderWidth: 0, // Clean, modern look
        hoverOffset: 7
      }
    ]
  };

  // Use fixed legend text color for best visibility (as in Revamp)
  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          font: { family: "Inter", size: 13, weight: 600 },
          color: "#9beffc", // Always readable, proven in revamp card!
          usePointStyle: true,
          padding: 14
        }
      }
    },
    animation: { animateScale: true, duration: 900, easing: "easeOutCubic" }
  };

  const lineChartData = {
    labels: priceLabels,
    datasets: [
      {
        label: "SHARE Price",
        data: priceData,
        borderColor: "rgba(12,242,224,1)",
        backgroundColor: "rgba(12,242,224,0.5)",
        fill: true,
        yAxisID: "yPrice",
        pointRadius: 1.7,
        borderWidth: 1,
        tension: 0.32,
        order: 2,
      },
      {
        label: "Volume",
        data: volumeData,
        type: "bar",
        backgroundColor: "rgba(255,92,30,0.75)",
        borderColor: "rgba(255,92,30,1)",
        borderWidth: 2,
        yAxisID: "yVolume",
        order: 1,
        barPercentage: 0.65,
        categoryPercentage: 0.75,
      },
    ],
  };
  
  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          usePointStyle: true,
          color: "#9beffc",
          font: { family: "Inter", size: 15, weight: 300 },
          padding: 16
        }
      },
      title: {
        display: false,
      },
      tooltip: {
        enabled: true,
        mode: "index",
        intersect: false,
        callbacks: {
          label: (ctx) => {
            const { dataset, formattedValue } = ctx;
            return `${dataset.label}: ${formattedValue} ${
              dataset.yAxisID === "yPrice" ? currentChain?.currency : ""
            }`;
          }
        }
      }
    },
    scales: {
      yPrice: {
        type: "linear",
        position: "left",
        grid: {
          drawOnChartArea: true,
          color: "rgba(12,242,224,0.1)"
        },
        title: {
          display: true,
          text: `Price (${currentChain?.currency})`,
          color: "rgba(12,242,224,0.5)",
          font: { size: 13, weight: 500 }
        },
        ticks: {
          color: "rgba(12,242,224,0.5)",
          font: { family: "Inter", size: 13 }
        }
      },
      yVolume: {
        type: "linear",
        position: "right",
        grid: { drawOnChartArea: false },
        title: {
          display: true,
          text: `Volume (${currentChain?.currency})`,
          color: "rgba(255,92,30,1)",
          font: { size: 13, weight: 500 }
        },
        ticks: {
          color: "rgba(255,92,30,1)",
          font: { family: "Inter", size: 13 }
        }
      },
      x: {
        grid: {
          color: "rgba(111,226,250,0.08)"
        },
        ticks: {
          color: "#9beffc",
          font: { family: "Inter", size: 13 }
        }
      }
    },
    animation: { duration: 900, easing: "easeOutQuart" }
  };

  useEffect(() => {
    if (contract) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract]);

  useEffect(() => {
    // Only on small screens
    if (window.innerWidth <= 991 && priceHistoryScrollRef.current) {
      const container = priceHistoryScrollRef.current;
      // Center the scroll
      container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2.4;
    }
  }, [])


  return (
    <Container
      className="revamp-page"
      style={{
        maxWidth: 1800,
        margin: "0 auto",
        background: "inherit",
        color: "inherit",
        padding: "3.5rem 1.2rem 2rem",
      }}
    >
      {/* Network mismatch warning */}
      {!chainOk && (
        <Alert variant="warning" className="d-flex flex-wrap align-items-center mt-3">
          <span>
            Switched from&nbsp;
            <strong>{selectedNetwork?.label ?? "previous network"}</strong>
            &nbsp;to&nbsp;
            <strong>{currentChain?.label || "new network"}</strong>.
            &nbsp;For the latest data, please refresh:
          </span>
          <Button variant="primary" size="sm" className="ms-2" onClick={hardRefresh}>
            Refresh
          </Button>
        </Alert>
      )}

      {loading && (
        <div className="revamp-page-loading-overlay">
          <Spinner animation="border" variant="light" />
          <span className="ms-2">Loading…</span>
        </div>
      )}

      {/* ======= Dashboard headline ======= */}
      <h2
        className="text-center"
        style={{
          fontWeight: 900,
          fontSize: "2.05rem",
          letterSpacing: ".02em",
          color: "var(--rvnwl-accent-cyan)",
          margin: "1.6rem 0 0.5rem"
        }}
      >
        Shareholding Pool
      </h2>
      <div
        className="mx-auto mb-4"
        style={{
          width: 68,
          height: 4,
          background: "linear-gradient(90deg, var(--rvnwl-accent-cyan) 30%, transparent 100%)",
          borderRadius: 2,
        }}
      />
      <p className="rev-subtext text-center mb-5" style={{ fontSize: "1.13rem", opacity: 0.84 }}>
        Own a share of the protocol’s revenue. Earn on every new purchase, plus proportional rewards from the global pool.
      </p>

      {/* ======= Metric Cards Row (fixed width grid, 3 equal cards, max 1800px) ======= */}
      <div className="dashboard-metrics-grid">
        {/* Global Stats */}
        <Card className="dashboard-card" style={{ minHeight: 370 }}>
          <Card.Header
            style={{
              background: "transparent",
              border: "none",
              padding: "1.2rem 2rem 0.8rem 2rem"
            }}
          >
            <h2
              style={{
                fontSize: "1.32rem",
                fontWeight: 600,
                color: "var(--rvnwl-accent-cyan)",
                marginBottom: 0,
                letterSpacing: ".04em",
                textTransform: "uppercase"
              }}
            >
              Global Stats
            </h2>
            <div
              style={{
                height: 3,
                width: "100%",
                background: "linear-gradient(90deg, var(--rvnwl-accent-cyan) 30%, transparent 100%)",
                margin: "10px 0 0 0",
                borderRadius: 2
              }}
            />
          </Card.Header>
          <div className="card-body" style={{ marginTop: 18 }}>
            {/* ...your stats code as before... */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontWeight: 500, color: "var(--rvnwl-accent-cyan)" }}>Current Price:</span>
              <span style={{ fontWeight: 700, color: "var(--rvnwl-accent-burn)" }}>
                {parseFloat(globalStats.currentPrice).toFixed(6)} {currentChain?.currency}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span>Last Purchase:</span>
              <span style={{ fontWeight: 700, color: "#8bc6fa" }}>
                {parseFloat(globalStats.lastPurchasePrice).toFixed(6)} {currentChain?.currency}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span>Total Volume:</span>
              <span style={{ fontWeight: 700, color: "#f7ba7a" }}>
                {parseFloat(globalStats.totalVolumePurchased).toFixed(2)} {currentChain?.currency}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Total Holders:</span>
              <span style={{ fontWeight: 700, color: "#f7eb7a" }}>{globalStats.totalHolders}</span>
            </div>
            <Button className="mt-4 w-100" variant="primary" onClick={() => setShowBuy(true)}>
              Buy SHARE
            </Button>
          </div>
        </Card>

        {/* My Stats */}
        <Card className="dashboard-card" style={{ minHeight: 370 }}>
          <Card.Header
            style={{
              background: "transparent",
              border: "none",
              padding: "1.2rem 2rem 0.8rem 2rem"
            }}
          >
            <h2
              style={{
                fontSize: "1.32rem",
                fontWeight: 600,
                color: "var(--rvnwl-accent-cyan)",
                marginBottom: 0,
                letterSpacing: ".04em",
                textTransform: "uppercase"
              }}
            >
              My Stats
            </h2>
            <div
              style={{
                height: 3,
                width: "100%",
                background: "linear-gradient(90deg, var(--rvnwl-accent-cyan) 30%, transparent 100%)",
                margin: "10px 0 0 0",
                borderRadius: 2
              }}
            />
          </Card.Header>
          <div className="card-body" style={{ marginTop: 18 }}>
            {/* ...your stats code as before... */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontWeight: 600, color: "var(--rvnwl-accent-cyan)" }}>Balance:</span>
              <span style={{ fontWeight: 900, color: "var(--rvnwl-accent-burn)" }}>{userShare.toFixed(4)} SHARE</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontWeight: 500 }}>Unclaimed Sales:</span>
              <span style={{ fontWeight: 700, color: "#00e898" }}>{parseFloat(userStats.userSalesRewards).toFixed(4)} {currentChain?.currency}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontWeight: 500 }}>Unclaimed Fees:</span>
              <span style={{ fontWeight: 700, color: "#ff8e65" }}>{parseFloat(userStats.userSystemRewards).toFixed(4)} {currentChain?.currency}</span>
            </div>
            <div className="d-flex gap-2 mt-4">
              <Button variant="outline-success" className="w-100" onClick={() => setShowClaim(true)}>
                Claim Rewards
              </Button>
              <Button variant="outline-primary" className="w-100" onClick={claim}>
                Reinvest Rewards
              </Button>
            </div>
          </div>
        </Card>

        {/* Share Distribution */}
        <Card className="dashboard-card" style={{ minHeight: 370 }}>
          <Card.Header
            style={{
              background: "transparent",
              border: "none",
              padding: "1.2rem 2rem 0.8rem 2rem"
            }}
          >
            <h2
              style={{
                fontSize: "1.32rem",
                fontWeight: 600,
                color: "var(--rvnwl-accent-cyan)",
                marginBottom: 0,
                letterSpacing: ".04em",
                textTransform: "uppercase"
              }}
            >
              Share Distribution
            </h2>
            <div
              style={{
                height: 3,
                width: "100%",
                background: "linear-gradient(90deg, var(--rvnwl-accent-cyan) 30%, transparent 100%)",
                margin: "10px 0 0 0",
                borderRadius: 2
              }}
            />
          </Card.Header>
          <div className="card-body text-center" style={{ marginTop: 18 }}>
            <div style={{ height: 200, maxWidth: 220, margin: "0 auto" }}>
            <Pie
              data={pieData}
              options={pieOptions}
            />
            </div>
            <div className="mt-3" style={{ fontWeight: 400 }}>
              You control {" "}
              <span style={{ color: "var(--rvnwl-accent-burn)", fontWeight: 600 }}>
                {userShare.toFixed(4)}
              </span>
              {"/100.00 SHARE."}
            </div>
          </div>
        </Card>
      </div>

      {/* ======= Price & volume history ======= */}
      <div className="price-history-scroll-outer" ref={priceHistoryScrollRef}>
        <Card className="dashboard-card mb-4 price-history-card">
        <Card.Header
          style={{
            background: "transparent",
            border: "none",
            padding: "1.2rem 2rem 0.8rem 2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <h2
              style={{
                fontSize: "1.32rem",
                fontWeight: 600,
                color: "var(--rvnwl-accent-cyan)",
                marginBottom: 0,
                letterSpacing: ".04em",
                textTransform: "uppercase"
              }}
            >
              Price &amp; Volume History
            </h2>
            <div
              style={{
                height: 3,
                width: "100%",
                background: "linear-gradient(90deg, var(--rvnwl-accent-cyan) 30%, transparent 100%)",
                margin: "10px 0 0 0",
                borderRadius: 2
              }}
            />
          </div>
          <Button
            variant="outline-light"
            size="sm"
            disabled={historyLoading}
            onClick={loadHistory}
            title="Fetch latest on-chain data"
            className="refresh-btn ms-3"
            style={{
              fontWeight: 700,
              borderColor: "var(--rvnwl-accent-cyan)",
              color: "var(--rvnwl-accent-cyan)",
              background: "transparent",
              marginLeft: 24,
              marginTop: 12
            }}
          >
            {historyLoading ? <Spinner animation="border" size="sm" /> : "Refresh"}
          </Button>
          </Card.Header>
            <Card.Body className="price-history-card-body">
              {historyLoading && historicalData.length === 0 ? (
                <div className="d-flex flex-column align-items-center justify-content-center" style={{ height: "100%" }}>
                  <Spinner animation="border" variant="info" />
                  <span className="mt-2" style={{ color: "#9beffc", fontWeight: 500 }}>Loading chart…</span>
                </div>
              ) : (
                <Line data={lineChartData} options={lineChartOptions} />
              )}
            </Card.Body>
          </Card>
        </div>

      {/* --- Buy Modal --- */}
      <Modal show={showBuy} onHide={() => setShowBuy(false)} centered dialogClassName="revamp-modal-dialog" contentClassName="revamp-modal">
        <Modal.Header closeButton>
        <Modal.Title style={{ fontWeight: 700, letterSpacing: ".04em" }}>
            Buy SHARE</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {processing && (
            <div className="processing-overlay">
              <Spinner animation="border" /> <p className="mt-2">Waiting…</p>
            </div>
          )}
          <div className="mb-2" style={{ color: "#b0b8cc", fontWeight: 700 }}>
            Wallet: <span style={{ color: "#fff" }}>{parseFloat(walletBal).toFixed(4)} {currentChain?.currency}</span>
          </div>
          <Form.Group className="mb-3">
            <Form.Control
              type="number"
              placeholder={`${currentChain?.currency || "Native"} to spend`}
              value={nativeSpend}
              onChange={(e) => onSpend(e.target.value)}
              disabled={processing}
              className="glass-input"
            />
          </Form.Group>
          {estShares && (
            <div className="mb-2" style={{ color: "var(--rvnwl-accent-cyan)", fontWeight: 600 }}>
              Estimated SHARE: {estShares}
            </div>
          )}
          {parseFloat(nativeSpend || 0) > parseFloat(walletBal || 0) && (
            <Alert variant="warning" className="py-1 px-2 small">
              Insufficient balance
            </Alert>
          )}
          <Form.Check
            className="mt-3"
            type="checkbox"
            label={
              <>
                I agree to the{" "}
                <Button variant="link" size="sm" className="p-0 align-baseline" onClick={() => setShowTerms(true)} style={{ color: "var(--rvnwl-accent-cyan)" }}>
                  terms
                </Button>
              </>
            }
            checked={agreeTC}
            onChange={(e) => setAgreeTC(e.target.checked)}
            disabled={processing}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowBuy(false)} disabled={processing} style={{ fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            onClick={buy}
            disabled={processing || !agreeTC || !nativeSpend || parseFloat(nativeSpend) > parseFloat(walletBal)}
            style={{ fontWeight: 600 }}
            variant="primary"
          >
            {processing ? "Processing…" : "Confirm"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* --- Tx-Success Modal --- */}
      <Modal show={showTxModal} onHide={closeTxModal} centered dialogClassName="revamp-modal-dialog" contentClassName="revamp-modal">
        <Modal.Header>
          <Modal.Title className="text-success">Transaction confirmed</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted">Your purchase was mined successfully.</p>
          <p className="small">
            <strong>Tx Hash: </strong>
            <a href={`${currentChain?.explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--rvnwl-accent-cyan)" }}>
              {txHash?.slice(0,12)}…{txHash?.slice(-12)}
            </a>
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="success" style={{fontWeight: 600 }} onClick={closeTxModal}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* --- Terms & Conditions --- */}
      <Modal show={showTerms} onHide={() => setShowTerms(false)} centered dialogClassName="revamp-modal-dialog tandc-modal" contentClassName="revamp-modal tandc-modal" backdropClassName="tandc-modal-backdrop">
        <Modal.Header closeButton>
          <Modal.Title>Terms &amp; Conditions</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small">
            By purchasing <strong>SHARE</strong> you acknowledge and accept:
          </p>
          <ul className="small mb-0">
            <li>Cryptocurrency prices are highly volatile; values can go to zero.</li>
            <li>All smart-contract interactions are irreversible once mined.</li>
            <li>No entity behind this interface provides investment advice.</li>
            <li>
              Full documentation:{" "}
              <a href="https://docs.revya.io" target="_blank" rel="noopener noreferrer">
                docs.revya.io
              </a>
            </li>
            <li>
              Source code:{" "}
              <a href="https://github.com/revya/protocol" target="_blank" rel="noopener noreferrer">
                GitHub repo
              </a>
            </li>
          </ul>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" style={{fontWeight: 600 }} onClick={() => setShowTerms(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* --- Claim Modal --- */}
      <Modal show={showClaim} onHide={() => setShowClaim(false)} centered dialogClassName="revamp-modal-dialog" contentClassName="revamp-modal">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontWeight: 700, letterSpacing: ".04em" }}>
            Claim Rewards</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div style={{ color: "#00e898", fontWeight: 600 }}>Sales: {parseFloat(userStats.userSalesRewards).toFixed(2)} {currentChain?.currency}</div>
          <div style={{ color: "#ff8e65", fontWeight: 600 }}>Fees: {parseFloat(userStats.userSystemRewards).toFixed(2)} {currentChain?.currency}</div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowClaim(false)} style={{fontWeight: 600 }} disabled={processing}>Cancel</Button>
          <Button onClick={claim} style={{fontWeight: 600 }}disabled={processing}>{processing ? "Processing…" : "Claim now"}</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
