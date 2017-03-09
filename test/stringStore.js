var StringStore = artifacts.require("./StringStore.sol");

Extensions = require("../utils/extensions.js");
Extensions.init(web3, assert);

contract('StringStore', function(accounts) {

    var owner1, owner2, owner3;

    before("should have correct accounts", () => {
        assert.isAtLeast(accounts.length, 3, "should have at least 3 accounts");
        owner1 = accounts[0];
        owner2 = accounts[1];
        owner3 = accounts[2];
        return Extensions.makeSureAreUnlocked([ owner1, owner2, owner3 ]);
    });

    describe("Creation", function() {

        it("should not be possible to deploy a StringStore with the same owner", function() {
            return Extensions.expectedExceptionPromise(
                () => StringStore.new(owner1, { from: owner1, gas: 3000000 }),
                3000000);
        });

        it("should not be possible to deploy a StringStore with the other owner at 0", function() {
            return Extensions.expectedExceptionPromise(
                () => StringStore.new(
                    "0x0000000000000000000000000000000000000000",
                    { from: owner1, gas: 3000000 }),
                3000000);
        });

        it("should be possible to deploy a StringStore", function() {
            return StringStore.new(owner2, { from: owner1 })
                .then(created => Promise.all([
                    created.owners(owner1),
                    created.owners(owner2),
                    created.owners(owner3),
                    created.stored(0)
                ]))
                .then(values => {
                    assert.isTrue(values[0], "owner1 should be marked as owner");
                    assert.isTrue(values[1], "owner2 should be marked as owner");
                    assert.isFalse(values[2], "owner3 should not be marked as owner");
                    assert.strictEqual(values[3], "", "should be initial value");
                });
        });

    });

    describe("Store value", function() {

        var stringStore;

        beforeEach("should deploy a new StringStore", function () {
            return StringStore.new(owner2, { from: owner1 })
                .then(created => stringStore = created);
        });

        it("should not allow to store value if not an owner", function () {
            return Extensions.expectedExceptionPromise(
                () => stringStore.store(0, "Hello World", { from: owner3 }),
                300000);
        });

        it("should not store value if single confirmation", function() {
            var storeValueData0 = stringStore.contract.store.getData(0, "Hello World");
            var shaKey0;
            return stringStore.hashData(storeValueData0)
                .then(hashed => {
                    shaKey0 = hashed;
                    return stringStore.store.call(0, "Hello World", { from: owner1 });
                })
                .then(success => {
                    assert.isFalse(success, "It should not accept storing just yet");
                    return stringStore.store(0, "Hello World", { from: owner1 });
                })
                .then(txObject => {
                    assert.strictEqual(txObject.logs.length, 1, "should have had 1 event");
                    assert.strictEqual(
                        txObject.receipt.logs[0].topics[0],
                        web3.sha3("OnUnfinishedConfirmation(bytes32)"),
                        "should have been proper topic");
                    assert.strictEqual(
                        txObject.logs[0].args.key, shaKey0,
                        "should have been the properly hashed data");
                    return stringStore.confirmations(shaKey0);
                })
                .then(confirmation0 => {
                    assert.strictEqual(
                        confirmation0.toNumber(), 1,
                        "The pending confirmation should have been recorded");
                    return stringStore.stored(0);
                })
                .then(stored => assert.strictEqual(stored,"", "should still be initial value"));
        });

        describe("And enough confirmations", function() {

            var storeValueData0, shaKey0;

            beforeEach("should add a confirmation from owner1", function() {
                storeValueData0 = stringStore.contract.store.getData(0, "Hello World");
                return stringStore.hashData(storeValueData0)
                    .then(hashed => {
                        shaKey0 = hashed;
                        return stringStore.store(0, "Hello World", { from: owner1 });
                    });
            });

            it("should fail to store value if second confirmation from same account", function () {
                return stringStore.store.call(0, "Hello World", { from: owner1 })
                    .then(success => {
                        assert.isFalse(success, "It should still not accept storing value");
                        return stringStore.store(0, "Hello World", { from: owner1 });
                    })
                    .then(txObject => {
                        assert.strictEqual(
                            txObject.logs.length, 0,
                            "should have had no event for duplicate confirmation");
                        return stringStore.confirmations(shaKey0);
                    })
                    .then(confirmation0 => {
                        assert.strictEqual(
                            confirmation0.toNumber(), 1,
                            "The pending confirmation should still be there");
                        return stringStore.stored(0);
                    })
                    .then(stored => assert.strictEqual(stored, "", "should still be initial value"));
            });

            it("should store value when second confirmation from other owner", function () {
                return stringStore.store.call(0, "Hello World", { from: owner2 })
                    .then(success => {
                        assert.isTrue(success, "It should accept storing now");
                        return stringStore.store(0, "Hello World", { from: owner2 });
                    })
                    .then(txObject => {
                        assert.strictEqual(txObject.logs.length, 0, "should not have had any event");
                        return stringStore.confirmations(shaKey0);
                    })
                    .then(function (confirmation0) {
                        assert.strictEqual(
                            confirmation0.toNumber(), 0,
                            "The pending confirmation should have been removed");
                        return stringStore.stored(0);
                    })
                    .then(stored => assert.strictEqual(stored, "Hello World", "should be updated"));
            });

            it("should be possible to change voting owner between confirmations", function() {
                return Promise.all([
                        stringStore.changeOwner(owner1, owner3, { from: owner1 }),
                        stringStore.changeOwner(owner1, owner3, { from: owner2 })
                    ])
                    .then(txObjects => Promise.all([
                        stringStore.owners(owner1),
                        stringStore.owners(owner2),
                        stringStore.owners(owner3)
                    ]))
                    .then(values => {
                        assert.isFalse(values[0], "owner1 should no longer be marked as owner");
                        assert.isTrue(values[1], "owner2 should be marked as owner");
                        assert.isTrue(values[2], "owner3 should be marked as owner now");
                        // Voting with new owner
                        return stringStore.store.call(0, "Hello World", { from: owner3 });
                    })
                    .then(success => {
                        assert.isTrue(success, "It should accept storing now");
                        return stringStore.store(0, "Hello World", { from: owner3 });
                    })
                    .then(txObject => {
                        assert.strictEqual(txObject.logs.length, 0, "should not have had any event");
                        return stringStore.confirmations(shaKey0);
                    })
                    .then(function (confirmation0) {
                        assert.strictEqual(
                            confirmation0.toNumber(), 0,
                            "The pending confirmation should have been removed");
                        return stringStore.stored(0);
                    })
                    .then(stored => assert.strictEqual(stored, "Hello World", "should be updated"));
            });

            it("should be possible to change other owner between confirmations", function() {
                return Promise.all([
                        stringStore.changeOwner(owner2, owner3, { from: owner1 }),
                        stringStore.changeOwner(owner2, owner3, { from: owner2 })
                    ])
                    .then(txObjects => Promise.all([
                        stringStore.owners(owner1),
                        stringStore.owners(owner2),
                        stringStore.owners(owner3)
                    ]))
                    .then(values => {
                        assert.isTrue(values[0], "owner1 should be marked as owner");
                        assert.isFalse(values[1], "owner2 should no longer be marked as owner");
                        assert.isTrue(values[2], "owner3 should be marked as owner now");
                        // Voting with new owner
                        return stringStore.store.call(0, "Hello World", { from: owner3 });
                    })
                    .then(success => {
                        assert.isTrue(success, "It should accept storing now");
                        return stringStore.store(0, "Hello World", { from: owner3 });
                    })
                    .then(txObject => {
                        assert.strictEqual(txObject.logs.length, 0, "should not have had any event");
                        return stringStore.confirmations(shaKey0);
                    })
                    .then(function (confirmation0) {
                        assert.strictEqual(
                            confirmation0.toNumber(), 0,
                            "The pending confirmation should have been removed");
                        return stringStore.stored(0);
                    })
                    .then(stored => assert.strictEqual(stored, "Hello World", "should be updated"));
            });

            it("should be possible to have 2 competing pending confirmations", function () {
                var storeValueData1 = stringStore.contract.store.getData(0, "Hello Mars");
                var shaKey1;
                return stringStore.hashData(storeValueData1)
                    .then(hashed => {
                        shaKey1 = hashed;
                        return stringStore.store.call(0, "Hello Mars", { from: owner1 });
                    })
                    .then(function (success) {
                        assert.isFalse(success, "it should not accept storing value");
                        return stringStore.store(0, "Hello Mars", { from: owner1 });
                    })
                    .then(txObject => {
                        assert.strictEqual(txObject.logs.length, 1, "should have had 1 event");
                        assert.strictEqual(
                            txObject.receipt.logs[0].topics[0],
                            web3.sha3("OnUnfinishedConfirmation(bytes32)"),
                            "should have been proper topic");
                        assert.strictEqual(
                            txObject.logs[0].args.key, shaKey1,
                            "should have been the properly hashed data");
                        return Promise.all([
                            stringStore.confirmations(shaKey0),
                            stringStore.confirmations(shaKey1)
                        ]);
                    })
                    .then(confirmations => {
                        assert.strictEqual(
                            confirmations[0].toNumber(), 1,
                            "The pending confirmation should have been recorded");
                        assert.strictEqual(
                            confirmations[1].toNumber(), 1,
                            "The pending confirmation should have been recorded");
                        return stringStore.stored(0);
                    })
                    .then(stored => {
                        assert.strictEqual(stored, "", "should be unchanged");
                        return Promise.all([
                            stringStore.store.call(0, "Hello World", { from: owner2 }),
                            stringStore.store.call(0, "Hello Mars", { from: owner2 })
                        ]);
                    })
                    .then(successes => {
                        assert.isTrue(successes[0], "it should accept storing first value");
                        assert.isTrue(successes[1], "it should accept storing second value");
                    });
            });

        });

        describe("And competing confirmations", function() {

            beforeEach("should add 2 competing confirmations from owner1", function() {
                return Promise.all([
                        stringStore.store(0, "Hello World", { from: owner1 }),
                        stringStore.store(0, "Hello Mars", { from: owner1 })
                    ]);
            });

            it("should pass the first if comes first", function() {
                return stringStore.store.call(0, "Hello World", { from: owner2 })
                    .then(success => {
                        assert.isTrue(success, "should accept to store value");
                        return stringStore.store(0, "Hello World", { from: owner2 });
                    })
                    .then(txObject => stringStore.stored(0))
                    .then(stored => {
                        assert.strictEqual(stored, "Hello World", "should have updated");
                    });
            });

            it("should pass the second if comes first", function() {
                return stringStore.store.call(0, "Hello Mars", { from: owner2 })
                    .then(success => {
                        assert.isTrue(success, "should accept to store value");
                        return stringStore.store(0, "Hello Mars", { from: owner2 });
                    })
                    .then(txObject => stringStore.stored(0))
                    .then(stored => {
                        assert.strictEqual(stored, "Hello Mars", "should have updated");
                    });
            });

            it("should overwrite first with second if in this order", function() {
                return stringStore.store(0, "Hello World", { from: owner2 })
                    .then(txObject => stringStore.store.call(0, "Hello Mars", { from: owner2 }))
                    .then(success => {
                        assert.isTrue(
                            success,
                            "should still accept to store value with competing change");
                        return stringStore.store(0, "Hello Mars", { from: owner2 });
                    })
                    .then(txObject => stringStore.stored(0))
                    .then(stored => {
                        assert.strictEqual(stored, "Hello Mars", "should have overwritten value");
                    });
            });

            it("should overwrite second with first if in this order", function() {
                return stringStore.store(0, "Hello Mars", { from: owner2 })
                    .then(txObject => stringStore.store.call(0, "Hello World", { from: owner2 }))
                    .then(success => {
                        assert.isTrue(
                            success,
                            "should still accept to store value with competing change");
                        return stringStore.store(0, "Hello World", { from: owner2 });
                    })
                    .then(txObject => stringStore.stored(0))
                    .then(stored => {
                        assert.strictEqual(stored, "Hello World", "should have overwritten value");
                    });
            });

        });

    });

});

