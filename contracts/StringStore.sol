import "MultiOwned.sol";

contract StringStore is MultiOwned {
	mapping (uint => string) public stored;

	function StringStore(address _owner2)
		MultiOwned(_owner2) {
	}

	function store(uint key0, string value) 
		fromOwner
		isConfirmed
		returns (bool success) {
		stored[key0] = value;
		return true;
	}
}