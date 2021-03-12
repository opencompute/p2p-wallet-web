import React, { FunctionComponent, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { styled } from '@linaria/react';
import classNames from 'classnames';
import { rgba } from 'polished';

import { TokenAccount } from 'api/token/TokenAccount';
import { Widget } from 'components/common/Widget';
import { Button, Icon } from 'components/ui';
import { openModal } from 'store/actions/modals';
import { SHOW_MODAL_ADD_COIN } from 'store/constants/modalTypes';
import { RootState } from 'store/rootReducer';
import { loadHiddenTokens } from 'utils/settings';

import { TokenList } from './TokenList';

const WrapperWidget = styled(Widget)``;

const AddButton = styled(Button)`
  color: #5887ff !important;

  &:hover {
    background: #eff3ff !important;
  }
`;

const IconPlus = styled(Icon)`
  width: 20px;
  height: 20px;
  margin-right: 8px;
`;

const HiddenTokens = styled.div`
  position: relative;

  display: flex;
  align-items: center;

  padding: 20px;

  cursor: pointer;

  &::before {
    position: absolute;
    top: 0;
    right: 10px;
    left: 10px;

    border-bottom: 1px solid ${rgba(0, 0, 0, 0.05)};

    content: '';
  }

  &.isOpen {
    &::after {
      position: absolute;
      right: 10px;
      bottom: 0;
      left: 10px;

      border-bottom: 1px solid ${rgba(0, 0, 0, 0.05)};

      content: '';
    }
  }
`;

const HideIconWrapper = styled.div`
  padding: 0 15px;
`;

const IconHide = styled(Icon)`
  width: 20px;
  height: 20px;

  color: #a3a5ba;
`;

const Text = styled.div`
  flex-grow: 1;

  color: #a3a5ba;

  font-weight: 600;
  font-size: 16px;
`;

const ChevronIcon = styled(Icon)`
  width: 16px;
  height: 16px;

  color: #a3a5ba;
`;

const ChevronWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;

  width: 24px;
  height: 24px;

  transform: rotate(270deg);
  cursor: pointer;

  &.isOpen {
    transform: rotate(0deg);
  }
`;

export const TokensWidget: FunctionComponent = () => {
  const dispatch = useDispatch();
  const [isOpen, setIsOpen] = useState(false);
  const tokenAccounts = useSelector((state: RootState) =>
    state.wallet.tokenAccounts.map((account) => TokenAccount.from(account)),
  );

  const tokens = [];
  const hiddenTokensList = [];

  const hiddenTokens = loadHiddenTokens();

  for (const token of tokenAccounts) {
    if (hiddenTokens.has(token.address.toBase58())) {
      hiddenTokensList.push(token);
    } else {
      tokens.push(token);
    }
  }

  const handleAddCoinClick = () => {
    dispatch(openModal(SHOW_MODAL_ADD_COIN));
  };

  const handleChevronClick = () => {
    setIsOpen(!isOpen);
  };

  return (
    <WrapperWidget
      title="Wallets"
      action={
        <AddButton lightGray small onClick={handleAddCoinClick}>
          <IconPlus name="plus" /> Add Token
        </AddButton>
      }>
      <TokenList items={tokens} />
      {hiddenTokensList.length > 0 ? (
        <HiddenTokens onClick={handleChevronClick} className={classNames({ isOpen })}>
          <HideIconWrapper>
            <IconHide name="hide" />
          </HideIconWrapper>
          <Text>{`${hiddenTokensList.length} hidden wallets`}</Text>
          <ChevronWrapper className={classNames({ isOpen })}>
            <ChevronIcon name="chevron" />
          </ChevronWrapper>
        </HiddenTokens>
      ) : undefined}
      {isOpen ? <TokenList items={hiddenTokensList} isHidden /> : undefined}
    </WrapperWidget>
  );
};