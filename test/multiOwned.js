web3.eth.getTransactionReceiptMined = function (txnHash, interval) {
  var transactionReceiptAsync;
  interval = interval ? interval : 500;
  transactionReceiptAsync = function(txnHash, resolve, reject) {
    try {
      var receipt = web3.eth.getTransactionReceipt(txnHash);
      if (receipt == null) {
        setTimeout(function () {
          transactionReceiptAsync(txnHash, resolve, reject);
        }, interval);
      } else {
        resolve(receipt);
      }
    } catch(e) {
      reject(e);
    }
  };

  return new Promise(function (resolve, reject) {
      transactionReceiptAsync(txnHash, resolve, reject);
  });
};

var getEventsPromise = function (myFilter, count) {
  return new Promise(function (resolve, reject) {
    count = count ? count : 1;
    var results = [];
    myFilter.watch(function (error, result) {
      if (error) {
        reject(error);
      } else {
        count--;
        results.push(result);
      }
      if (count <= 0) {
        resolve(results);
        myFilter.stopWatching();
      }
    });
  });
};

var expectedExceptionPromise = function (action, gasToUse) {
  return new Promise(function (resolve, reject) {
      try {
        resolve(action());
      } catch(e) {
        reject(e);
      }
    })
    .then(function (txn) {
      return web3.eth.getTransactionReceiptMined(txn);
    })
    .then(function (receipt) {
      // We are in Geth
      assert.equal(receipt.gasUsed, gasToUse, "should have used all the gas");
    })
    .catch(function (e) {
      if ((e + "").indexOf("invalid JUMP") > -1) {
        // We are in TestRPC
      } else {
        throw e;
      }
    });
};

contract('MultiOwned', function(accounts) {

  var owned;

  it("should deploy a new MultiOwned", function () {

    return MultiOwned.new(accounts[1], { from: accounts[0], gas: 300000 })
      .then(function (_owned) {
        owned = _owned;
      });

  });


  it("should have 2 admins", function() {

    return owned.owners(accounts[0])
      .then(function (isOwner) {
        assert.isTrue(isOwner, "First account should be owner");
        return owned.owners(accounts[1])
      })
      .then(function (isOwner) {
        assert.isTrue(isOwner, "Second account should be owner");
      });

  });

  it("should require 2 confirmations to change owner", function () {

    var blockNumber;
    var shaKey0;
    return owned.changeOwner.call(accounts[1], accounts[2], { from: accounts[0], gas: 300000 })
      .then(function (success) {
        assert.isFalse(success, "It should not accept changing owner");
        // The block onto which the next transactions go
        blockNumber = web3.eth.blockNumber + 1;
        return owned.changeOwner(accounts[1], accounts[2], { from: accounts[0], gas: 300000 });
      })
      .then(function (txn1) {
        return Promise.all([
          getEventsPromise(owned.OnUnfinishedConfirmation({},
            { fromBlock: blockNumber, toBlock: 'latest' })),
          web3.eth.getTransactionReceiptMined(txn1)
        ]);
      })
      .then(function (shaAndReceipt) {
        shaKey0 = shaAndReceipt[0][0].args.key;
        return owned.confirmations(shaKey0);
      })
      .then(function (confirmation0) {
        assert.equal(confirmation0.toNumber(), 1, "The pending confirmation should have been recorded");
        return Promise.all([ owned.owners(accounts[1]), owned.owners(accounts[2]) ]);
      })
      .then(function (isOwners) {
        assert.isTrue(isOwners[0], "Account 1 should still be owner");
        assert.isFalse(isOwners[1], "Account 2 should not be owner yet");
        return owned.changeOwner.call(accounts[1], accounts[2], { from: accounts[1], gas: 200000 });
      })
      .then(function (success) {
        assert.isTrue(success, "It should accept changing owner");
        return owned.changeOwner(accounts[1], accounts[2], { from: accounts[1], gas: 200000 });
      })
      .then(function (txn2) {
        return web3.eth.getTransactionReceiptMined(txn2);
      })
      .then(function (receipt) {
        return Promise.all([ owned.owners(accounts[1]), owned.owners(accounts[2]) ]);
      })
      .then(function (isOwners) {
        assert.isFalse(isOwners[0], "Account 1 should no longer be an owner");
        assert.isTrue(isOwners[1], "Account 2 should be an owner now");
        return owned.confirmations(shaKey0);
      })
      .then(function (confirmation0) {
        assert.equal(confirmation0.toNumber(), 0, "The pending confirmation should have been removed");
      });

  });

  it("should deploy a new MultiOwned", function () {

    return MultiOwned.new(accounts[1], { from: accounts[0], gas: 300000 })
      .then(function (_owned) {
        owned = _owned;
      });

  });

  it("should fail to change owner if 2 confirmations from same account", function () {

    var blockNumber;
    var shaKey0;
    return owned.changeOwner.call(accounts[1], accounts[2], { from: accounts[0], gas: 300000 })
      .then(function (success) {
        assert.isFalse(success, "It should not accept changing owner");
        // The block onto which the next transactions go
        blockNumber = web3.eth.blockNumber + 1;
        return owned.changeOwner(accounts[1], accounts[2], { from: accounts[0], gas: 300000 });
      })
      .then(function (txn1) {
        return Promise.all([
          getEventsPromise(owned.OnUnfinishedConfirmation({},
            { fromBlock: blockNumber, toBlock: 'latest' })),
          web3.eth.getTransactionReceiptMined(txn1)
        ]);
      })
      .then(function (shaAndReceipt) {
        shaKey0 = shaAndReceipt[0][0].args.key;
        return owned.confirmations(shaKey0);
      })
      .then(function (confirmation0) {
        assert.equal(confirmation0.toNumber(), 1, "The pending confirmation should have been recorded");
        return Promise.all([ owned.owners(accounts[1]), owned.owners(accounts[2]) ]);
      })
      .then(function (isOwners) {
        assert.isTrue(isOwners[0], "Account 1 should still be owner");
        assert.isFalse(isOwners[1], "Account 2 should not be owner");
        return owned.changeOwner.call(accounts[1], accounts[2], { from: accounts[0], gas: 200000 });
      })
      .then(function (success) {
        assert.isFalse(success, "It should not accept changing owner");
        return owned.changeOwner(accounts[1], accounts[2], { from: accounts[0], gas: 200000 });
      })
      .then(function (txn2) {
        return web3.eth.getTransactionReceiptMined(txn2);
      })
      .then(function (receipt) {
        return Promise.all([ owned.owners(accounts[1]), owned.owners(accounts[2]) ]);
      })
      .then(function (isOwners) {
        assert.isTrue(isOwners[0], "Account 1 should still be owner");
        assert.isFalse(isOwners[1], "Account 2 should not be owner anyway");
        return owned.confirmations(shaKey0);
      })
      .then(function (confirmation0) {
        assert.equal(confirmation0.toNumber(), 1, "The pending confirmation should still be there");
      });

  });

  it("should be possible to have 2 concurrently pending confirmations", function () {

    var blockNumber;
    var shaKey1;
    var shaKey2;

    return Promise.all([ 
        owned.changeOwner.call(accounts[0], accounts[2], { from: accounts[0], gas: 300000 }),
        owned.changeOwner.call(accounts[1], accounts[3], { from: accounts[0], gas: 300000 })
      ])
      .then(function (successes) {
        assert.isFalse(successes[0], "it should not accept changing owner 1");
        assert.isFalse(successes[1], "it should not accept changing owner 2");
        // The block onto which the next transactions go
        blockNumber = web3.eth.blockNumber + 1;
        return Promise.all([
          owned.changeOwner(accounts[0], accounts[2], { from: accounts[0], gas: 300000 }),
          owned.changeOwner(accounts[1], accounts[3], { from: accounts[0], gas: 300000 })
        ]);
      })
      .then(function (txns1) {
        return Promise.all([
          getEventsPromise(
            owned.OnUnfinishedConfirmation({},
              { fromBlock: blockNumber, toBlock: 'latest' }),
            2),
          web3.eth.getTransactionReceiptMined(txns1[0]),
          web3.eth.getTransactionReceiptMined(txns1[1])
        ]);
      })
      .then(function (shaAndReceipts) {
        shaKey1 = shaAndReceipts[0][0].args.key;
        shaKey2 = shaAndReceipts[0][1].args.key;
        assert.notEqual(shaKey1, shaKey2, "The 2 Sha keys should be different");
        return Promise.all([
          owned.confirmations(shaKey1),
          owned.confirmations(shaKey2)
        ]);
      })
      .then(function (confirmations) {
        assert.equal(confirmations[0].toNumber(), 1, "The pending confirmation should have been recorded");
        assert.equal(confirmations[1].toNumber(), 1, "The pending confirmation should have been recorded");
        return Promise.all([ 
          owned.owners(accounts[0]),
          owned.owners(accounts[1]),
          owned.owners(accounts[2]),
          owned.owners(accounts[3])
        ]);
      })
      .then(function (values) {
        assert.isTrue(values[0], "Account 0 should still be owner");
        assert.isTrue(values[1], "Account 1 should still be owner");
        assert.isFalse(values[2], "Account 2 should not be owner");
        assert.isFalse(values[3], "Account 3 should not be owner");
        return Promise.all([
          owned.changeOwner.call(accounts[0], accounts[2], { from: accounts[1], gas: 200000 }),
          owned.changeOwner.call(accounts[1], accounts[3], { from: accounts[1], gas: 200000 })
        ]);
      })
      .then(function (successes) {
        assert.isTrue(successes[0], "it should accept changing owner 1");
        assert.isTrue(successes[1], "it should accept changing owner 2");
        return Promise.all([
          owned.changeOwner(accounts[0], accounts[2], { from: accounts[1], gas: 200000 }),
          owned.changeOwner(accounts[1], accounts[3], { from: accounts[1], gas: 200000 })
        ]);
      })
      .then(function (txns2) {
        return Promise.all([
          web3.eth.getTransactionReceiptMined(txns2[0]),
          web3.eth.getTransactionReceiptMined(txns2[1])
        ]);
      })
      .then(function (receipts) {
        return Promise.all([ 
          owned.owners(accounts[0]),
          owned.owners(accounts[1]),
          owned.owners(accounts[2]),
          owned.owners(accounts[3])
        ]);
      })
      .then(function (values) {
        assert.isFalse(values[0], "Account 0 should no longer be owner");
        assert.isFalse(values[1], "Account 1 should no longer be owner");
        assert.isTrue(values[2], "Account 2 should now be owner");
        assert.isTrue(values[3], "Account 3 should now be owner");
        return Promise.all([
          owned.confirmations(shaKey1),
          owned.confirmations(shaKey2)
        ]);
      })
      .then(function (confirmations) {
        assert.equal(confirmations[0].toNumber(), 0, "The pending confirmation for owner 1 should have been removed");
        assert.equal(confirmations[1].toNumber(), 0, "The pending confirmation for owner 2 should have been removed");
      });

  });

  it("should deploy a new MultiOwned", function () {

    return MultiOwned.new(accounts[1], { from: accounts[0], gas: 300000 })
      .then(function (_owned) {
        owned = _owned;
      });

  });

  it("should not allow to end up with a single owner", function () {

    return owned.changeOwner(accounts[0], accounts[1], { from: accounts[0], gas: 300000 })
      .then(function (txn) {
        return web3.eth.getTransactionReceiptMined(txn);
      })
      .then(function (receipt) {
        assert.isBelow(receipt.gasUsed, 300000, "It should not have used all gas");
        return expectedExceptionPromise(function () {
          return owned.changeOwner(accounts[0], accounts[1], { from: accounts[1], gas: 300000 });
        }, 300000);        
      });

  });

  it("should not allow to end up with 3 owners", function () {

    return owned.changeOwner(accounts[2], accounts[3], { from: accounts[0], gas: 300000 })
      .then(function (txn) {
        return web3.eth.getTransactionReceiptMined(txn);
      })
      .then(function (receipt) {
        assert.isBelow(receipt.gasUsed, 300000, "It should not have used all gas");
        return expectedExceptionPromise(function () {
          return owned.changeOwner(accounts[2], accounts[3], { from: accounts[1], gas: 300000 });
        }, 300000);        
      });

  });

});
