import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';

import { ZERO } from '@orca-so/sdk';
import { unwrapResult } from '@reduxjs/toolkit';
import { u64 } from '@solana/spl-token';
import { createContainer } from 'unstated-next';

import { useSolana } from 'app/contexts/solana';
import { useConfig, usePools, usePrice, UserTokenAccountMap, useUser } from 'app/contexts/swap';
import SlippageTolerance from 'app/contexts/swap/models/SlippageTolerance';
import Trade from 'app/contexts/swap/models/Trade';
import { getMaxAge } from 'app/contexts/swap/utils/AsyncCache';
import { getTradeId } from 'app/contexts/swap/utils/pools';
import { minSolBalanceForSwap } from 'app/contexts/swap/utils/tokenAccounts';
import { openModal } from 'store/actions/modals';
import { SHOW_MODAL_TRANSACTION_CONFIRM } from 'store/constants/modalTypes';
import { updateTransactions } from 'store/slices/transaction/TransactionSlice';
import { Keys, useLocalStorage } from 'utils/hooks/useLocalStorage';
import { swapNotification } from 'utils/transactionNotifications';

export const defaultSelectedTokens = {
  input: 'USDC',
  output: 'SOL',
};

const DEFAULT_SLIPPAGE_TOLERANCE_STATE = { numerator: '10', denominator: '1000' };

export enum ButtonState {
  // eslint-disable-next-line no-unused-vars
  ConnectWallet,
  // eslint-disable-next-line no-unused-vars
  LoadingUserData,
  // eslint-disable-next-line no-unused-vars
  RouteDoesNotExist,
  // eslint-disable-next-line no-unused-vars
  Exchange,
  // eslint-disable-next-line no-unused-vars
  ConfirmWallet,
  // eslint-disable-next-line no-unused-vars
  SendingTransaction,
  // eslint-disable-next-line no-unused-vars
  ZeroInputValue,
  // eslint-disable-next-line no-unused-vars
  InputTokenAccountDoesNotExist,
  // eslint-disable-next-line no-unused-vars
  InsufficientBalance,
  // eslint-disable-next-line no-unused-vars
  OutputTooHigh,
  // eslint-disable-next-line no-unused-vars
  NotEnoughSOL,
  // eslint-disable-next-line no-unused-vars
  HighPriceImpact,
  // eslint-disable-next-line no-unused-vars
  Retry,
}

export interface UseSwap {
  trade: Trade;

  // Mint being traded from. The user must own these tokens.
  setInputTokenName: (m: string) => void;

  // Mint being traded to. The user will receive these tokens after the swap.
  setOutputTokenName: (m: string) => void;

  // Amount used for the swap.
  setInputAmount: (a: u64) => void;

  // *Expected* amount received from the swap.
  setOutputAmount: (a: u64) => void;

  // Function to flip what we consider to be the "to" and "from" mints.
  switchTokens: () => void;

  slippageTolerance: SlippageTolerance;
  setSlippageTolerance: (tolerance: SlippageTolerance) => void;

  // referral?: PublicKey;

  asyncStandardTokenAccounts: UserTokenAccountMap | null;
  inputTokenAmount: u64 | undefined;
  inputTokenPrice: number | undefined;
  outputTokenAmount: u64 | undefined;
  outputTokenPrice: number | undefined;
  intermediateTokenName: string | undefined;
  intermediateTokenPrice: number | undefined;
  buttonState: ButtonState;
  onSwap: () => Promise<boolean | undefined>;
}

export type UseSwapArgs = {
  inputTokenName?: string;
  outputTokenName?: string;
  // fromAmount?: number;
  // toAmount?: number;
  // referral?: PublicKey;
};

const useSwapInternal = (props: UseSwapArgs = {}): UseSwap => {
  const dispatch = useDispatch();
  const { wallet, connection } = useSolana();
  const { programIds, tokenConfigs, routeConfigs } = useConfig();
  const [inputTokenName, _setInputTokenName] = useState(props.inputTokenName ?? 'SOL');
  const [outputTokenName, _setOutputTokenName] = useState(props.outputTokenName ?? 'USDC');
  const [slippageToleranceState, setSlippageToleranceState] = useLocalStorage<{
    numerator: string;
    denominator: string;
  }>(Keys.SLIPPAGE_TOLERANCE, DEFAULT_SLIPPAGE_TOLERANCE_STATE);
  const [buttonState, setButtonState] = useState(ButtonState.ConnectWallet);
  // const [isFairnessIndicatorCollapsed, setIsFairnessIndicatorCollapsed] = useState(true);

  const slippageTolerance = useMemo(() => {
    return new SlippageTolerance(
      new u64(slippageToleranceState.numerator),
      new u64(slippageToleranceState.denominator),
    );
  }, [slippageToleranceState.numerator, slippageToleranceState.denominator]);

  const setSlippageTolerance = useCallback(
    (tolerance: SlippageTolerance) => {
      setSlippageToleranceState({
        numerator: tolerance.numerator.toString(),
        denominator: tolerance.denominator.toString(),
      });
    },
    [setSlippageToleranceState],
  );

  const [trade, setTrade] = useState<Trade>(
    () =>
      new Trade({
        inputTokenName,
        outputTokenName,
        amount: ZERO,
        isInputAmount: true,
        outputTooHigh: false,
        slippageTolerance,
        tokenConfigs,
        routes: routeConfigs[getTradeId(inputTokenName, outputTokenName)],
      }),
  );

  const tradeId = getTradeId(trade.inputTokenName, trade.outputTokenName);
  const intermediateTokenName = trade.getIntermediateTokenName();

  const [isRefreshRateIncreased, setIsRefreshRateIncreased] = useState(false);
  const maxAge = getMaxAge(isRefreshRateIncreased);

  const { useAsyncBatchedPools, fetchPool } = usePools();
  const poolIds = routeConfigs[tradeId]
    .flat()
    .filter((poolId, idx, list) => list.indexOf(poolId) === idx);
  const asyncPools = useAsyncBatchedPools(poolIds, maxAge);

  const { useAsyncStandardTokenAccounts, refreshStandardTokenAccounts } = useUser();
  const asyncStandardTokenAccounts = useAsyncStandardTokenAccounts(maxAge);
  const inputUserTokenAccount = asyncStandardTokenAccounts.value?.[trade.inputTokenName];
  const outputUserTokenAccount = asyncStandardTokenAccounts.value?.[trade.outputTokenName];
  const solUserTokenAccount = asyncStandardTokenAccounts.value?.['SOL'];

  const { useAsyncMergedPrices } = usePrice();
  const asyncPrices = useAsyncMergedPrices();
  const inputTokenPrice = asyncPrices.value?.[trade.inputTokenName];
  const outputTokenPrice = asyncPrices.value?.[trade.outputTokenName];
  const intermediateTokenPrice = intermediateTokenName
    ? asyncPrices.value?.[intermediateTokenName]
    : undefined;

  const minSolBalanceRequired = minSolBalanceForSwap(
    tokenConfigs['SOL'].decimals,
    !!asyncStandardTokenAccounts.value,
  );

  const setInputTokenName = useCallback(
    (tokenName: string) => {
      const routes = routeConfigs[getTradeId(tokenName, trade.outputTokenName)];
      _setInputTokenName(tokenName);
      setTrade(trade.updateInputToken(tokenName, routes));
    },
    [routeConfigs, trade],
  );

  const setOutputTokenName = useCallback(
    (tokenName: string) => {
      const routes = routeConfigs[getTradeId(trade.inputTokenName, tokenName)];
      _setOutputTokenName(tokenName);
      setTrade(trade.updateOutputToken(tokenName, routes));
    },
    [routeConfigs, trade],
  );

  const setInputAmount = useCallback(
    (amount: u64) => {
      setTrade(trade.updateInputAmount(amount));
    },
    [trade],
  );

  const setOutputAmount = useCallback(
    (amount: u64) => {
      setTrade(trade.updateOutputAmount(amount));
    },
    [trade],
  );

  const switchTokens = useCallback(() => {
    _setInputTokenName(trade.outputTokenName);
    _setOutputTokenName(trade.inputTokenName);
    setTrade(trade.switchTokens());
  }, [trade]);

  // Update trade instance when pool data becomes available
  useEffect(() => {
    if (!trade.pools && asyncPools.value) {
      setTrade(trade.updatePools(asyncPools.value));
    }
  }, [trade, asyncPools.value]);

  // Update trade instance when pool data refreshes
  useEffect(() => {
    if (asyncPools.value) {
      setTrade((trade) => trade.updatePools(asyncPools.value));
    }
  }, [asyncPools]);

  useEffect(() => {
    setTrade((trade) => trade.updateSlippageTolerance(slippageTolerance));
  }, [slippageTolerance]);

  useEffect(() => {
    if (
      buttonState === ButtonState.ConfirmWallet ||
      buttonState === ButtonState.SendingTransaction
    ) {
      return;
    }

    if (!trade.routes.length) {
      setButtonState(ButtonState.RouteDoesNotExist);
    } else if (!wallet) {
      setButtonState(ButtonState.ConnectWallet);
    } else if (!asyncStandardTokenAccounts.value || !asyncPools.value) {
      setButtonState(ButtonState.LoadingUserData);
    } else {
      const inputAmount = trade.getInputAmount();

      let solRemainingForFees = solUserTokenAccount?.getAmount() || ZERO;
      if (inputTokenName === 'SOL') {
        solRemainingForFees = solRemainingForFees.lt(inputAmount)
          ? ZERO
          : solRemainingForFees.sub(inputAmount);
      }

      if (inputAmount.eq(ZERO)) {
        setButtonState(ButtonState.ZeroInputValue);
      } else if (solRemainingForFees.lt(minSolBalanceRequired)) {
        setButtonState(ButtonState.NotEnoughSOL);
      } else if (!inputUserTokenAccount || inputUserTokenAccount.getAmount().lt(inputAmount)) {
        setButtonState(ButtonState.InsufficientBalance);
      } else {
        if (trade.isPriceImpactHigh()) {
          setButtonState(ButtonState.HighPriceImpact);
        } else {
          setButtonState(ButtonState.Exchange);
        }
      }
    }
  }, [
    wallet,
    inputTokenName,
    tokenConfigs,
    asyncPools,
    buttonState,
    asyncStandardTokenAccounts,
    inputUserTokenAccount,
    trade,
    outputUserTokenAccount,
    solUserTokenAccount,
    minSolBalanceRequired,
  ]);

  useEffect(() => {
    setIsRefreshRateIncreased(
      buttonState === ButtonState.Exchange || buttonState === ButtonState.HighPriceImpact,
    );
  }, [buttonState]);

  const inputTokenAmount = inputUserTokenAccount?.accountInfo.amount;
  const outputTokenAmount = outputUserTokenAccount?.accountInfo.amount;

  const onSwap = useCallback(async () => {
    // setErrorMessage('');

    if (!asyncPools.value) {
      throw new Error('Pools have not loaded yet');
    }

    if (!asyncStandardTokenAccounts.value || !inputUserTokenAccount) {
      throw new Error('UserTokenAccounts has not loaded yet');
    }

    const inputAmount = trade.getInputAmount();
    const outputAmount = trade.getOutputAmount();

    if (inputAmount.eq(ZERO) || outputAmount.eq(ZERO)) {
      throw new Error('Input amount has not been set');
    }

    if (!trade.derivedFields) {
      throw new Error('Derived fields not set');
    }

    if (!wallet) {
      throw new Error('Wallet not set');
    }

    const result = unwrapResult(
      await dispatch(
        openModal({
          modalType: SHOW_MODAL_TRANSACTION_CONFIRM,
          props: {
            type: 'swap',
            params: {
              inputTokenName: inputTokenName,
              outputTokenName: outputTokenName,
              inputAmount: trade.getInputAmount(),
              minimumOutputAmount: trade.getMinimumOutputAmount(),
            },
          },
        }),
      ),
    );

    if (!result) {
      return false;
    }

    const inputUserTokenPublicKey = inputUserTokenAccount.account;

    setButtonState(() => ButtonState.ConfirmWallet);

    const intermediateTokenPublicKey = intermediateTokenName
      ? asyncStandardTokenAccounts.value[intermediateTokenName]
      : undefined;

    const notificationParams = {
      text: `${inputTokenName} to ${outputTokenName}`,
      symbol: inputTokenName,
      symbolB: outputTokenName,
    };

    swapNotification({
      header: 'Swap processing...',
      status: 'processing',
      ...notificationParams,
    });

    let executeSetup, executeSwap;
    try {
      ({ executeSetup, executeSwap } = await trade.confirmExchange(
        connection,
        tokenConfigs,
        programIds,
        wallet,
        inputUserTokenPublicKey,
        intermediateTokenPublicKey?.account,
        outputUserTokenAccount?.account,
      ));
      // setSolanaExplorerLink(getExplorerUrl('tx', txSignature, cluster));
    } catch (e) {
      console.error(e);
      // setErrorMessage(walletConfirmationFailure);
      setButtonState(() => ButtonState.Exchange);

      swapNotification({
        header: 'Swap didn’t complete!',
        status: 'error',
        ...notificationParams,
        text: 'Click approve in your wallet to continue.',
      });

      return;
    }

    setButtonState(() => ButtonState.SendingTransaction);

    if (executeSetup) {
      try {
        await executeSetup();
      } catch (e) {
        console.error(e);
        // setErrorMessage('Something went wrong during setup. Please try again.');
        setButtonState(ButtonState.Retry);
        return;
      }
    }

    // // Hack: Pause for 10 seconds to increase the probability
    // // that we fetch the new token account even if the RPC server
    // // is unstable.
    // await new Promise((resolve) => setTimeout(resolve, 10_000));

    function getFailedTransactionErrorMessage(rawMessage: string) {
      if (rawMessage.includes('Transaction too large')) {
        return 'Transaction failed. Please try again.';
      } else if (rawMessage.includes('custom program error: 0x10')) {
        return 'The price moved more than your slippage tolerance setting. You can increase your tolerance or simply try again.';
      } else if (rawMessage.includes('Blockhash not found')) {
        return 'Transaction timed out. Please try again.';
      } else {
        return 'Oops, something went wrong. Please try again!';
      }
    }

    try {
      await executeSwap();

      swapNotification({
        header: 'Swapped successfuly!',
        status: 'success',
        ...notificationParams,
      });
    } catch (e) {
      console.error(e);
      const error = getFailedTransactionErrorMessage(e.message);
      // setErrorMessage(error);
      setButtonState(() => ButtonState.Retry);

      swapNotification({
        header: 'Swap didn’t complete!',
        status: 'error',
        ...notificationParams,
        text: error,
      });
      return;
    }

    try {
      const fetchingUserTokenAccounts = refreshStandardTokenAccounts();
      await Promise.all(trade.derivedFields.selectedRoute.map((poolId) => fetchPool(poolId)));
      await fetchingUserTokenAccounts;

      // TODO: until we made new transactions package
      dispatch(updateTransactions(true));
    } catch (e) {
      console.error(e);
    }

    setTrade(trade.clearAmounts());
    setButtonState(ButtonState.Exchange);
    // setSolanaExplorerLink('');

    // const snackbarKey = enqueueSnackbar(
    //   <ExchangeNotification
    //     closeSnackbar={() => closeSnackbar(snackbarKey)}
    //     txid={txSignature}
    //     inputTokenAmount={inputAmount}
    //     inputTokenName={trade.inputTokenName}
    //     outputTokenAmount={outputAmount}
    //     outputTokenName={trade.outputTokenName}
    //     inputDecimals={tokenConfigs[trade.inputTokenName].decimals}
    //     outputDecimals={tokenConfigs[trade.outputTokenName].decimals}
    //   />,
    // );
  }, [
    asyncPools.value,
    asyncStandardTokenAccounts.value,
    connection,
    fetchPool,
    inputTokenName,
    inputUserTokenAccount,
    intermediateTokenName,
    outputTokenName,
    outputUserTokenAccount?.account,
    programIds,
    refreshStandardTokenAccounts,
    tokenConfigs,
    trade,
    dispatch,
    wallet,
  ]);

  return {
    trade,
    setInputTokenName,
    setOutputTokenName,
    setInputAmount,
    setOutputAmount,
    switchTokens,
    slippageTolerance,
    setSlippageTolerance,
    // referral,
    asyncStandardTokenAccounts: asyncStandardTokenAccounts?.value,
    inputTokenAmount,
    inputTokenPrice,
    outputTokenAmount,
    outputTokenPrice,
    intermediateTokenName,
    intermediateTokenPrice,
    buttonState,
    onSwap,
  };
};

export const { Provider: SwapProvider, useContainer: useSwap } = createContainer(useSwapInternal);