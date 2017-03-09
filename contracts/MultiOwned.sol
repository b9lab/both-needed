pragma solidity ^0.4.5;

contract MultiOwned {
    mapping (address => bool) public owners;
    struct Confirmation {
        uint count;
        mapping (address => bool) confirmed;    
    }
    mapping (bytes32 => Confirmation) public confirmations;

    event OnUnfinishedConfirmation(bytes32 key);
    
    function MultiOwned(address _owner2) {
        if (msg.sender == _owner2 || _owner2 == 0) {
            throw;
        }
        owners[msg.sender] = true;
        owners[_owner2] = true;
    }

    modifier fromOwner {
        if (!owners[msg.sender]) {
            throw;
        }
        _;
    }

    modifier isConfirmed {
        bytes32 key = hashData(msg.data);
        if (confirmations[key].confirmed[msg.sender]) {
            return;
        }
        confirmations[key].count++;
        confirmations[key].confirmed[msg.sender] = true;
        if (confirmations[key].count < 2) {
            OnUnfinishedConfirmation(key);
            return;
        }
        delete confirmations[key];
        _;
    }

    function hashData(bytes data)
        constant
        returns (bytes32 hashed) {
        return sha3(data);
    }

    function changeOwner(address oldOwner, address newOwner) 
        fromOwner
        isConfirmed 
        returns (bool success){
        if (!owners[oldOwner]) {
            throw;
        }
        if (owners[newOwner]) {
            throw;
        }
        if (newOwner == 0) {
            throw;
        }
        owners[oldOwner] = false;
        owners[newOwner] = true;
        return true;
    }
}