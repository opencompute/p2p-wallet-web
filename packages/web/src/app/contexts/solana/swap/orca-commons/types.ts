import type { u64 } from '@solana/spl-token';
import type { PublicKey } from '@solana/web3.js';

import type { CurveType } from 'app/contexts/solana/swap/orca-commons/data';

// Pools
export type PoolJSON = {
  account: string;
  authority: string;
  nonce: number;
  poolTokenMint: string;
  tokenAccountA: string;
  tokenAccountB: string;
  feeAccount: string;
  hostFeeAccount?: string;
  feeNumerator: number;
  feeDenominator: number;
  ownerTradeFeeNumerator: number;
  ownerTradeFeeDenominator: number;
  ownerWithdrawFeeNumerator: number;
  ownerWithdrawFeeDenominator: number;
  hostFeeNumerator: number;
  hostFeeDenominator: number;
  tokenAName: string;
  tokenBName: string;
  curveType: string;
  amp?: number;
  programVersion?: number;
  deprecated?: boolean;
};

export type PoolJSONS = {
  [poolId: string]: PoolJSON;
};

export type PoolConfig = Pick<PoolJSON, 'tokenAName' | 'tokenBName'> & {
  account: PublicKey;
  authority: PublicKey;
  poolTokenMint: PublicKey;
  tokenAccountA: PublicKey;
  tokenAccountB: PublicKey;
  hostFeeAccount: PublicKey | null;
  ownerTradeFeeNumerator: u64;
  ownerTradeFeeDenominator: u64;
  ownerWithdrawFeeNumerator: u64;
  ownerWithdrawFeeDenominator: u64;
  amp: u64 | undefined;
  deprecated: boolean;
  programVersion: number;
  hostFeeNumerator: u64;
  hostFeeDenominator: u64;
  curveType: CurveType;
  feeNumerator: u64;
  feeDenominator: u64;
  feeAccount: PublicKey;
};

export type PoolConfigs = {
  [poolId: string]: PoolConfig;
};

// Tokens
export type TokenJSON = {
  mint: string;
  name: string;
  identifier?: string;
  wrapper?: string;
  decimals: number;
  fetchPrice?: boolean;
  poolToken?: boolean;
};

export type TokenJSONS = {
  [poolId: string]: TokenJSON;
};

export type TokenConfig = TokenJSON & {
  mint: PublicKey;
};

export type TokenConfigs = {
  [poolId: string]: TokenConfig;
};

// TokenPrices
export type TokenPrices = {
  [symbol: string]: number;
};

type CloudFlareMeta = {
  type: 'hot' | 'cold';
  updatedAt: string;
  version: string;
};

export type ProgramIds = 'serumTokenSwap' | 'tokenSwapV2' | 'tokenSwap' | 'token' | 'aquafarm';

type CloudFlareData = {
  tokens: Record<string, Pick<TokenJSON, 'mint' | 'name' | 'fetchPrice' | 'decimals'>>;
  pools: Record<string, PoolJSON>;
  programIds: Record<ProgramIds, string>;
};

export type CloudFlareOrcaCache = {
  metadata: CloudFlareMeta;
  value: CloudFlareData;
};
