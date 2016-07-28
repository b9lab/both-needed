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

contract('StringStore', function(accounts) {

  it("should have 2 admins", function() {

    var store = StringStore.deployed();
    return store.owners(accounts[0])
      .then(function (isOwner) {
        assert.isTrue(isOwner, "First account should be owner");
        return store.owners(accounts[1])
      })
      .then(function (isOwner) {
        assert.isTrue(isOwner, "Second account should be owner");
      });

  });

  it("should require 2 confirmations", function () {

    var store = StringStore.deployed();
    var blockNumber;
    var shaKey0;
    return store.stored(0)
      .then(function (value0) {
        assert.equal(value0, "", "There should be no string at 0");
        return store.store.call(0, "value0", { from: accounts[0], gas: 300000 });
      })
      .then(function (success) {
        assert.isFalse(success, "It should not accept storing");
        // The block onto which the next transactions go
        blockNumber = web3.eth.blockNumber + 1;
        return store.store(0, "value0", { from: accounts[0], gas: 300000 });
      })
      .then(function (txn1) {
        return Promise.all([
          getEventsPromise(store.OnUnfinishedConfirmation({},
            { fromBlock: blockNumber, toBlock: 'latest' })),
          web3.eth.getTransactionReceiptMined(txn1)
        ]);
      })
      .then(function (shaAndReceipt) {
        shaKey0 = shaAndReceipt[0][0].args.key;
        return store.confirmations(shaKey0);
      })
      .then(function (confirmation0) {
        assert.equal(confirmation0.toNumber(), 1, "The pending confirmation should have been recorded");
        return store.stored(0);
      })
      .then(function (value0) {
        assert.equal(value0, "", "There should still be no string at 0");
        return store.store.call(0, "value0", { from: accounts[1], gas: 200000 });
      })
      .then(function (success) {
        assert.isTrue(success, "It should accept storing");
        return store.store(0, "value0", { from: accounts[1], gas: 200000 });
      })
      .then(function (txn2) {
        return web3.eth.getTransactionReceiptMined(txn2);
      })
      .then(function (receipt) {
        return store.stored(0);
      })
      .then(function (value0) {
        assert.equal(value0, "value0", "The string value should have been recorded");
        return store.confirmations(shaKey0);
      })
      .then(function (confirmation0) {
        assert.equal(confirmation0.toNumber(), 0, "The pending confirmation should have been removed");
      });

  });

  it("should fail if 2 confirmations from same account", function () {

    var store = StringStore.deployed();
    var blockNumber;
    var shaKey0;
    return store.stored(0)
      .then(function (value0) {
        assert.equal(value0, "value0", "There should be the old string at 0");
        return store.store.call(0, "value1", { from: accounts[0], gas: 300000 });
      })
      .then(function (success) {
        assert.isFalse(success, "It should not accept storing");
        // The block onto which the next transactions go
        blockNumber = web3.eth.blockNumber + 1;
        return store.store(0, "value1", { from: accounts[0], gas: 300000 });
      })
      .then(function (txn1) {
        return Promise.all([
          getEventsPromise(store.OnUnfinishedConfirmation({},
            { fromBlock: blockNumber, toBlock: 'latest' })),
          web3.eth.getTransactionReceiptMined(txn1)
        ]);
      })
      .then(function (shaAndReceipt) {
        shaKey0 = shaAndReceipt[0][0].args.key;
        return store.confirmations(shaKey0);
      })
      .then(function (confirmation0) {
        assert.equal(confirmation0.toNumber(), 1, "The pending confirmation should have been recorded");
        return store.stored(0);
      })
      .then(function (value0) {
        assert.equal(value0, "value0", "There should still be the old string at 0");
        return store.store.call(0, "value1", { from: accounts[0], gas: 200000 });
      })
      .then(function (success) {
        assert.isFalse(success, "It should not accept storing");
        return store.store(0, "value1", { from: accounts[0], gas: 200000 });
      })
      .then(function (txn2) {
        return web3.eth.getTransactionReceiptMined(txn2);
      })
      .then(function (receipt) {
        return store.stored(0);
      })
      .then(function (value0) {
        assert.equal(value0, "value0", "The string value should still be the old one");
        return store.confirmations(shaKey0);
      })
      .then(function (confirmation0) {
        assert.equal(confirmation0.toNumber(), 1, "The pending confirmation should still be there");
      });

  });

  it("should be possible to have 2 concurrently pending confirmations", function () {

    var store = StringStore.deployed();
    var blockNumber;
    var shaKey1;
    var shaKey2;

    return Promise.all([ store.stored(1), store.stored(2) ])
      .then(function (values) {
        assert.equal(values[0], "", "There should be no string at 1");
        assert.equal(values[1], "", "There should be no string at 2");
        return Promise.all([ 
          store.store.call(1, "value1", { from: accounts[0], gas: 300000 }),
          store.store.call(2, "value2", { from: accounts[0], gas: 300000 })
        ]);
      })
      .then(function (successes) {
        assert.isFalse(successes[0], "it should not accept storing value1");
        assert.isFalse(successes[1], "it should not accept storing value2");
        // The block onto which the next transactions go
        blockNumber = web3.eth.blockNumber + 1;
        return Promise.all([
          store.store(1, "value1", { from: accounts[0], gas: 300000 }),
          store.store(2, "value2", { from: accounts[0], gas: 300000 })
        ]);
      })
      .then(function (txns1) {
        return Promise.all([
          getEventsPromise(
            store.OnUnfinishedConfirmation({},
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
          store.confirmations(shaKey1),
          store.confirmations(shaKey2)
        ]);
      })
      .then(function (confirmations) {
        assert.equal(confirmations[0].toNumber(), 1, "The pending confirmation should have been recorded");
        assert.equal(confirmations[1].toNumber(), 1, "The pending confirmation should have been recorded");
        return Promise.all([ store.stored(1), store.stored(2) ]);
      })
      .then(function (values) {
        assert.equal(values[0], "", "There should still be no string at 1");
        assert.equal(values[1], "", "There should still be no string at 2");
        return Promise.all([
          store.store.call(1, "value1", { from: accounts[1], gas: 200000 }),
          store.store.call(2, "value2", { from: accounts[1], gas: 200000 })
        ]);
      })
      .then(function (successes) {
        assert.isTrue(successes[0], "it should accept storing value1");
        assert.isTrue(successes[1], "it should accept storing value2");
        return Promise.all([
          store.store(1, "value1", { from: accounts[1], gas: 200000 }),
          store.store(2, "value2", { from: accounts[1], gas: 200000 })
        ]);
      })
      .then(function (txns2) {
        return Promise.all([
          web3.eth.getTransactionReceiptMined(txns2[0]),
          web3.eth.getTransactionReceiptMined(txns2[1])
        ]);
      })
      .then(function (receipts) {
        return Promise.all([ store.stored(1), store.stored(2) ]);
      })
      .then(function (values) {
        assert.equal(values[0], "value1", "The string value1 should have been recorded");
        assert.equal(values[1], "value2", "The string value2 should have been recorded");
        return Promise.all([
          store.confirmations(shaKey1),
          store.confirmations(shaKey2)
        ]);
      })
      .then(function (confirmations) {
        assert.equal(confirmations[0].toNumber(), 0, "The pending confirmation for value1 should have been removed");
        assert.equal(confirmations[1].toNumber(), 0, "The pending confirmation for value2 should have been removed");
      });

  });

});
