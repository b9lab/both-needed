var MultiOwned = artifacts.require("./MultiOwned.sol");

Extensions = require("../utils/extensions.js");
Extensions.init(web3, assert);

contract('MultiOwned', function(accounts) {

    var owner1, owner2, owner3, owner4;

    before("should have correct accounts", () => {
        assert.isAtLeast(accounts.length, 4, "should have at least 4 accounts");
        owner1 = accounts[0];
        owner2 = accounts[1];
        owner3 = accounts[2];
        owner4 = accounts[3];
        return Extensions.makeSureAreUnlocked([ owner1, owner2, owner3 ]);
    });

    describe("Creation", function() {

        it("should not be possible to deploy a MultiOwned with the same owner", function() {
            return Extensions.expectedExceptionPromise(
                () => MultiOwned.new(owner1, { from: owner1, gas: 3000000 }),
                3000000);
        });

        it("should not be possible to deploy a MultiOwned with the other owner at 0", function() {
            return Extensions.expectedExceptionPromise(
                () => MultiOwned.new(
                    "0x0000000000000000000000000000000000000000",
                    { from: owner1, gas: 3000000 }),
                3000000);
        });

        it("should be possible to deploy a MultiOwned", function() {
            return MultiOwned.new(owner2, { from: owner1 })
                .then(created => Promise.all([
                    created.owners(owner1),
                    created.owners(owner2),
                    created.owners(owner3),
                    created.owners(owner4)
                ]))
                .then(areOwners => {
                    assert.isTrue(areOwners[0], "owner1 should be marked as owner");
                    assert.isTrue(areOwners[1], "owner2 should be marked as owner");
                    assert.isFalse(areOwners[2], "owner3 should not be marked as owner");
                    assert.isFalse(areOwners[3], "owner4 should not be marked as owner");
                });
        });

    });

    describe("Change owner", function() {

        var multiOwned;

        beforeEach("should deploy a new MultiOwned", function () {
            return MultiOwned.new(owner2, { from: owner1 })
                .then(created => multiOwned = created);
        });

        it("should not allow to change owner if not an owner", function () {
            return Extensions.expectedExceptionPromise(
                () => multiOwned.changeOwner(owner1, owner3, { from: owner3 }),
                300000);
        });

        it("should not change owner if single confirmation", function() {
            var changeOwnerData0 = multiOwned.contract.changeOwner.getData(owner2, owner3);
            var shaKey0;
            return multiOwned.hashData(changeOwnerData0)
                .then(hashed => {
                    shaKey0 = hashed;
                    return multiOwned.changeOwner.call(owner2, owner3, { from: owner1 });
                })
                .then(success => {
                    assert.isFalse(success, "It should not accept changing owner just yet");
                    return multiOwned.changeOwner(owner2, owner3, { from: owner1 });
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
                    return multiOwned.confirmations(shaKey0);
                })
                .then(confirmation0 => {
                    assert.strictEqual(
                        confirmation0.toNumber(), 1,
                        "The pending confirmation should have been recorded");
                    return Promise.all([
                        multiOwned.owners(owner1),
                        multiOwned.owners(owner2),
                        multiOwned.owners(owner3)
                    ]);
                })
                .then(areOwners => {
                    assert.isTrue(areOwners[0], "account 1 should still be owner");
                    assert.isTrue(areOwners[1], "account 2 should still be owner");
                    assert.isFalse(areOwners[2], "account 3 should not yet be owner");
                });
        });

        describe("And enough confirmations", function() {

            var changeOwnerData0, shaKey0;

            beforeEach("should add a confirmation from owner1", function() {
                changeOwnerData0 = multiOwned.contract.changeOwner.getData(owner2, owner3);
                return multiOwned.hashData(changeOwnerData0)
                    .then(hashed => {
                        shaKey0 = hashed;
                        return multiOwned.changeOwner(owner2, owner3, { from: owner1 });
                    });
            });

            it("should fail to change owner if second confirmation from same account", function () {
                return multiOwned.changeOwner.call(owner2, owner3, { from: owner1 })
                    .then(success => {
                        assert.isFalse(success, "It should still not accept changing owner");
                        return multiOwned.changeOwner(owner2, owner3, { from: owner1 });
                    })
                    .then(txObject => {
                        assert.strictEqual(
                            txObject.logs.length, 0,
                            "should have had no event for duplicate confirmation");
                        return multiOwned.confirmations(shaKey0);
                    })
                    .then(confirmation0 => {
                        assert.strictEqual(
                            confirmation0.toNumber(), 1,
                            "The pending confirmation should still be there");
                        return Promise.all([
                            multiOwned.owners(owner1),
                            multiOwned.owners(owner2),
                            multiOwned.owners(owner3)
                        ]);
                    })
                    .then(areOwners => {
                        assert.isTrue(areOwners[0], "account 1 should still be owner");
                        assert.isTrue(areOwners[1], "account 2 should still be owner");
                        assert.isFalse(areOwners[2], "account 3 should not yet be owner");
                    });
            });

            it("should change owner when second confirmation from other owner", function () {
                return multiOwned.changeOwner.call(
                        owner2, owner3,
                        { from: owner2 })
                    .then(success => {
                        assert.isTrue(success, "It should accept changing owner now");
                        return multiOwned.changeOwner(
                            owner2, owner3,
                            { from: owner2 });
                    })
                    .then(txObject => {
                        assert.strictEqual(txObject.logs.length, 0, "should not have had any event");
                        return multiOwned.confirmations(shaKey0);
                    })
                    .then(function (confirmation0) {
                        assert.strictEqual(confirmation0.toNumber(), 0, "The pending confirmation should have been removed");
                        return Promise.all([
                            multiOwned.owners(owner1),
                            multiOwned.owners(owner2),
                            multiOwned.owners(owner3)
                        ]);
                    })
                    .then(areOwners => {
                        assert.isTrue(areOwners[0], "account 1 should still be owner");
                        assert.isFalse(areOwners[1], "account 2 should no longer be owner");
                        assert.isTrue(areOwners[2], "account 3 should now be owner");
                    });
            });

            it("should be possible to have 2 concurrently pending confirmations", function () {
                var changeOwnerData1 = multiOwned.contract.changeOwner.getData(owner1, owner3);
                var shaKey1;
                return multiOwned.hashData(changeOwnerData1)
                    .then(hashed => {
                        shaKey1 = hashed;
                        return multiOwned.changeOwner.call(owner1, owner3, { from: owner1 });
                    })
                    .then(function (success) {
                        assert.isFalse(success, "it should not accept changing owner 1");
                        return multiOwned.changeOwner(owner1, owner3, { from: owner1 });
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
                            multiOwned.confirmations(shaKey0),
                            multiOwned.confirmations(shaKey1)
                        ]);
                    })
                    .then(confirmations => {
                        assert.strictEqual(
                            confirmations[0].toNumber(), 1,
                            "The pending confirmation should have been recorded");
                        assert.strictEqual(
                            confirmations[1].toNumber(), 1,
                            "The pending confirmation should have been recorded");
                        return Promise.all([ 
                            multiOwned.owners(owner1),
                            multiOwned.owners(owner2),
                            multiOwned.owners(owner3)
                        ]);
                    })
                    .then(values => {
                        assert.isTrue(values[0], "account 0 should still be owner");
                        assert.isTrue(values[1], "account 1 should still be owner");
                        assert.isFalse(values[2], "account 2 should not be owner");
                        return Promise.all([
                            multiOwned.changeOwner.call(owner1, owner3, { from: owner2 }),
                            multiOwned.changeOwner.call(owner2, owner3, { from: owner2 })
                        ]);
                    })
                    .then(successes => {
                        assert.isTrue(successes[0], "it should accept changing owner 1");
                        assert.isTrue(successes[1], "it should accept changing owner 2");
                    });
            });

        });

        describe("Sanity", function() {

            it("should not allow to end up with a single owner", function () {
                return multiOwned.changeOwner(owner1, owner2, { from: owner1 })
                    .then(txObject => Extensions.expectedExceptionPromise(
                        () => multiOwned.changeOwner(owner1, owner2, { from: owner2, gas: 3000000 }),
                        3000000));
            });

            it("should not allow to change a non-owner", function () {
                return multiOwned.owners(owner3)
                    .then(isOwner => {
                        assert.isFalse(isOwner, "should not be an owner");
                        return multiOwned.changeOwner(owner3, owner4, { from: owner1 });
                    })
                    .then(txObject => Extensions.expectedExceptionPromise(
                        () => multiOwned.changeOwner(owner3, owner4, { from: owner2, gas: 3000000 }),
                        3000000));
            });

            it("should not allow a 0 new owner", function () {
                return multiOwned.changeOwner(owner1, 0, { from: owner1 })
                    .then(txObject => Extensions.expectedExceptionPromise(
                        () => multiOwned.changeOwner(owner1, 0, { from: owner2, gas: 3000000 }),
                        3000000));
            });

        });

    });

});
