// src/constants.js

import polygonIcon  from "./assets/polygon.png";
import bscIcon      from "./assets/bsc.png";
import arbIcon      from "./assets/arbitrum.png";
import optIcon      from "./assets/optimism.png";
import ethIcon     from "./assets/ethereum.png";
import baseIcon     from "./assets/base.png";


export const DEFI_ADDRESSES = {
  56: "0x0ad80f518e630d066399271185e8dee61a966d87",    // BSC Mainnet
  137: "0xe7C68EC46EF391D6573087B0EA0aA48122A0438E",  // Polygon Mainnet
  1: "0x8e9b857abb19637fbc9db7d3d2fcced36368ca4b",     // Ethereum Mainnet
  8453: "0xba147e6aa96C5BD534f0D8237210a9065666eCcB",   // Base Mainnet
  42161: "0x8e9b857abb19637fbc9db7d3d2fcced36368ca4b",  // Arbitrum One
  10: "0x8e9b857abb19637fbc9db7d3d2fcced36368ca4b"      // Optimism Mainnet
};

export const SHAREHOLDING_ADDRESSES = {
  56: "0x964a42102b6c3c353b28d6c53816fb7b245d987b",    // BSC Mainnet
  137: "0xfE1880392486521FD4E6184bb64db49Bc69779CC",  // Polygon Mainnet
  1: "0x8e9b857abb19637fbc9db7d3d2fcced36368ca4b",     // Ethereum Mainnet
  8453: "0x8e9b857abb19637fbc9db7d3d2fcced36368ca4b",   // Base Mainnet
  42161: "0x8e9b857abb19637fbc9db7d3d2fcced36368ca4b",  // Arbitrum One
  10: "0x8e9b857abb19637fbc9db7d3d2fcced36368ca4b"      // Optimism Mainnet
};

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

export const AVAILABLE_NETWORKS = [
  {
    label: "BSC Mainnet",
    chainId: 56,
    currency: "BNB",
    explorerUrl: "https://bscscan.com",
    rpcUrl: "https://bsc-dataseed.binance.org/",
    icon: bscIcon,
  },
  {
    label: "Polygon Mainnet",
    chainId: 137,
    currency: "POL",
    explorerUrl: "https://polygonscan.com",
    rpcUrl: "https://polygon-rpc.com",
    icon: polygonIcon,
  },
  {
    label: "Ethereum Mainnet",
    chainId: 1,
    currency: "ETH",
    explorerUrl: "https://etherscan.io",
    rpcUrl: "https://mainnet.infura.io/v3/YOUR_INFURA_ID",
    icon: ethIcon,
  },
  {
    label: "Base Mainnet",
    chainId: 8453,
    currency: "ETH",
    explorerUrl: "https://basescan.org",
    rpcUrl: "https://mainnet.base.org",
    icon: baseIcon,
  },
  {
    label: "Arbitrum One",
    chainId: 42161,
    currency: "ETH",
    explorerUrl: "https://arbiscan.io",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    icon: arbIcon,
  },
  {
    label: "Optimism Mainnet",
    chainId: 10,
    currency: "ETH",
    explorerUrl: "https://optimistic.etherscan.io",
    rpcUrl: "https://mainnet.optimism.io",
    icon: optIcon,
  }
];
