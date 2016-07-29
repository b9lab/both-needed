contract MultiOwned {
	mapping (address => bool) public owners;
	struct Confirmation {
		uint count;
		mapping (address => bool) confirmed;	
	}
	mapping (bytes32 => Confirmation) public confirmations;

	event OnUnfinishedConfirmation(bytes32 key);
	
	function MultiOwned(address _owner2) {
		owners[msg.sender] = true;
		owners[_owner2] = true;
	}

	modifier fromOwner {
		if (!owners[msg.sender]) {
			throw;
		}
		_
	}

	modifier isConfirmed {
		bytes32 key = sha3(msg.data);
		if (!confirmations[key].confirmed[msg.sender]) {
			confirmations[key].count++;
		}
		confirmations[key].confirmed[msg.sender] = true;
		if (confirmations[key].count < 2) {
			OnUnfinishedConfirmation(key);
			return;
		}
		delete confirmations[key];
		_
	}

	function changeOwner(address oldOwner, address newOwner) 
		fromOwner
		isConfirmed 
		returns (bool success){
		if (!owners[oldOwner] || owners[newOwner]) {
			throw;
		}
		owners[oldOwner] = false;
		owners[newOwner] = true;
		return true;
	}
}