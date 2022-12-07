// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./Whitelist.sol";

contract JUKU_ERC20 is ERC20, Ownable, Whitelist {
    address public feeCollector; // address tax fee collector
    uint256 public taxFee; // tax fee percent

    event UpdateTaxFee(uint256 newTaxFee);
    event UpdateFeeCollector(address newFeeCollector);

    constructor(
        uint256 _totalSupply, // erc20 total supply
        uint256 _taxFee, // tax fee percent
        address _feeCollector, // fee collector address
        address[] memory _whiteList // array of whitelist wallets
    ) ERC20("JUKU", "JUKU") {
        require(_feeCollector != address(0), "JUKU: Zero address");
        require(_taxFee < 1e3, "JUKU: Tax fee can`t be more 100 percent");
        feeCollector = _feeCollector;
        taxFee = _taxFee;
        _mint(owner(), _totalSupply);
        uint256 length = _whiteList.length;
        for (uint256 i; i < length; ) {
            require(_whiteList[i] != address(0), "JUKU: Zero address");
            addAddressesToWhitelist(_whiteList);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev overridden ERC20 standard token transfer function. 
     If taxfee is greater than zero, it charges token transfer fees. 
     The commission is charged only from wallets that are not on the whitelist.
     @param to recipient address
     @param amount transfer amount
     */
    function transfer(address to, uint256 amount)
        public
        override
        returns (bool)
    {
        if (taxFee == 0) {
            _transfer(msg.sender, to, amount);
        } else {
            (uint256 sendAmount, uint256 feesAmount) = _checkFees(
                msg.sender,
                amount
            );
            _transfer(msg.sender, to, sendAmount);
            _transfer(msg.sender, feeCollector, feesAmount);
        }
        return true;
    }

    /**
     * @dev overridden ERC20 standard token transferFrom function. 
     If taxfee is greater than zero, it charges token transfer fees. 
     The commission is charged only from wallets that are not on the whitelist.
     @param from sender address
     @param to recipient address
     @param amount transfer amount
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        if (taxFee == 0) {
            _spendAllowance(from, msg.sender, amount);
            _transfer(from, to, amount);
        } else {
            (uint256 sendAmount, uint256 feesAmount) = _checkFees(from, amount);
            _spendAllowance(from, msg.sender, sendAmount);
            _transfer(from, to, sendAmount);
            _transfer(from, feeCollector, feesAmount);
        }
        return true;
    }

    /**
       @dev Function update tax fee percent. Only the owner can call it.
       @param newTaxFee new tax fee percent
     */
    function updateTaxFee(uint256 newTaxFee) external onlyOwner {
        require(newTaxFee < 1e3, "JUKU: Tax fee can`t be more 100 percent");
        taxFee = newTaxFee;
        emit UpdateTaxFee(newTaxFee);
    }

    /**
       @dev Function update fee collector address. Only the owner can call it.
       @param newFeeCollector new fee collector address
     */
    function updateFeesCollector(address newFeeCollector) external onlyOwner {
        require(newFeeCollector != address(0), "JUKU: Zero address");
        feeCollector = newFeeCollector;
        emit UpdateFeeCollector(newFeeCollector);
    }

    /**
       @dev an internal function that makes tax fee calculation .
       @param sender sender wallet address.
       @param amount transfer amount.
       @return sendAmount transfer amount without fees
       @return feesAmount fees amount
     */
    function _checkFees(address sender, uint256 amount)
        internal
        view
        returns (uint256 sendAmount, uint256 feesAmount)
    {
        if (!whitelist[sender]) {
            feesAmount = (amount * taxFee) / 1e3;
            sendAmount = amount - feesAmount;
        } else {
            feesAmount = 0;
            sendAmount = amount;
        }
    }
}
