var StringStore = artifacts.require("./StringStore.sol");

Extensions = require("../utils/extensions.js");
Extensions.init(web3, {});

module.exports = function(deployer, network) {
    deployer
        .then(() => web3.eth.getAccountsPromise())
        .then(accounts => {
            return deployer.deploy(
                StringStore, accounts[1],
                { from: accounts[0], gas: 3000000 });
        });
};
