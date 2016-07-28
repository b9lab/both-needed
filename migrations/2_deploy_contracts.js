module.exports = function(deployer, network) {
  deployer.deploy(StringStore, web3.eth.accounts[1], { from: web3.eth.accounts[0], gas: 3000000 });
};
