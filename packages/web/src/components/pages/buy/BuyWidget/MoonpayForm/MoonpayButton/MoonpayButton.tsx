import type { FC } from 'react';

import { styled } from '@linaria/react';

import { useBuyState } from 'app/contexts';
import { Button, Icon } from 'components/ui';
import { formatNumberToUSD } from 'utils/format';

const IconWrapper = styled(Icon)`
  width: 24px;
  height: 24px;
  margin-right: 8px;
`;

export const MoonpayButton: FC = () => {
  const { isLoading, setIsShowIframe, error, amount, isBaseAmountType, buyQuote } = useBuyState();

  if (isLoading) {
    return (
      <Button disabled primary full>
        Loading...
      </Button>
    );
  }

  if (!Number(amount)) {
    return (
      <Button disabled primary full>
        Enter the amount
      </Button>
    );
  }

  if (
    isBaseAmountType &&
    buyQuote?.baseCurrencyAmount &&
    buyQuote?.baseCurrencyAmount > Number(amount)
  ) {
    return (
      <Button disabled primary full>
        Minimum amount {formatNumberToUSD(buyQuote.baseCurrencyAmount)}
      </Button>
    );
  }

  if (error && amount) {
    const errorText = error.replace(/_SOL|(.$)/g, '');
    return (
      <Button disabled primary full>
        {errorText}
      </Button>
    );
  }

  return (
    <Button primary full onClick={() => setIsShowIframe(true)}>
      <IconWrapper name="external" />
      Continue on Moonpay
    </Button>
  );
};
