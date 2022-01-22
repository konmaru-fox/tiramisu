const { expect, use } = require("chai");
const { describe, test } = require("mocha");
const { ethers } = require("hardhat");
const chaiAsPromised = require("chai-as-promised");
const { getAccounts, toBase10 } = require("../utils");

// augment missing functionality in chai, helpful for dealing with async operations
use(chaiAsPromised);

describe("Tiramisu savings club", () => {
  const NUM_TEST_ACCOUNTS = 10;
  let accounts; // list of NUM_TEST_ACCOUNTS accounts
  let addresses; // list of NUM_TEST_ACCOUNTS addresses
  let names; // Placeholder for human readable names, using UPPERCASE of address for now
  let account1;
  let account2;
  let testaddresses;
  let testnames;

  let contract; // deployed contract object

  // runs once before the first test in this block
  // eslint-disable-next-line no-undef 
  before(async () => {
    // Generate 10 test accounts deterministically from hardhat
    accounts = await getAccounts(NUM_TEST_ACCOUNTS);

    // Map this list of accounts to a list of addresses for convenience
    addresses = accounts.map(account => account.address);

    names = addresses.map(address => address.toUpperCase());

  });

  // `beforeEach` will run before each test, re-deploying the contract every time
  beforeEach(async () => {
    account1 = accounts[0];
    const testaccounts = await ethers.getSigners();
    testaddresses = testaccounts.map(account => account.address);
    testnames = testaddresses.map(address => address.toUpperCase());
    account2 = testaccounts[0];
    testaddresses[account2]="";

    const factory = await ethers.getContractFactory("TiramisuSavingsClub");
    contract = await factory.deploy();
  
    await contract.deployed();
  });

  describe("createGroup", function () {
    it("should revert when creating an empty group", async function () {
        await expect(
            contract.connect(account1).createGroup([], [], 0)
        ).to.be.revertedWith("Cannot create an empty group");
    });

    it("should revert when _members and _names length does not match", async function () {
        await expect(
            contract.connect(account1).createGroup(testaddresses, names, 0)
        ).to.be.revertedWith("_members and _names length should match");
    });

    it("should revert when _members and _names length does not match", async function () {
        await expect(
            contract.connect(account1).createGroup(addresses, testnames, 0)
        ).to.be.revertedWith("_members and _names length should match");
    });

    it("should revert when _owner index is invalid", async function () {
        await expect(
            contract.connect(account1).createGroup(addresses, names, 10)
        ).to.be.revertedWith("_owner index invalid");
    });

    it("should revert when address or name is empty", async function () {
        await expect(
            contract.connect(account1).createGroup(testaddresses, testnames, 0)
        ).to.be.revertedWith("_address or _name has empty imput");
    });
    
    it("should revert when address already belongs to a group", async function () {
        await contract.createGroup(addresses, names, 0);

        await expect(
            contract.connect(account1).createGroup(addresses, names, 0)
        ).to.be.revertedWith("Failed to create a group, because an address already belongs to a group");
    });
  });

  describe("deposit", function () {
    it("should revert when deposit amount is not greater than zero", async function () {
        await expect(
            contract.connect(account1).deposit({from: addresses[account1], value: 0})
        ).to.be.revertedWith("Deposit amount must be greater than zero");
    });

    it("should increase group balance by message value when valid amount is provided", async function () {
        await contract.createGroup(addresses, names, 0);

        let originalbalance = await contract.groups[1].balance;
        originalbalance = originalbalance.toNumber();
        await contract
            .connect(account1)
            .deposit({value: 100});

        let laterbalance = await contract.groups[1].balance;
        laterbalance = laterbalance.toNumber();

        expect(laterbalance).to.equal(originalbalance + 100);
    });

    it("should decrease message sender's deposit by message value when valid amount is provided", async function () {        
        await contract.createGroup(addresses, names, 0);

        let originaldeposit = await contract.deposits(addresses[account1]);
        originaldeposit = originaldeposit.toNumber();
        await contract
            .connect(account1)
            .deposit({value: 100});

        let laterbalance = await contract.deposits(addresses[account1]);
        laterbalance = laterbalance.toNumber();

        expect(laterbalance).to.equal(originalbalance - 100);
    });
  });

  describe("withdraw", function () {
    it("should revert when withdrawal amount is not positive", async function () {
        await expect(
            contract.connect(account1).withdraw({from: addresses[account1], value: -1000})
        ).to.be.revertedWith("Withdrawal amount must be positive");
    });

    it("should revert when withdrawal amount is greater than group's balance", async function () {
        await contract.createGroup(addresses, names, 0);
        await contract.deposit({value: 10000});

        await expect(
            contract.connect(account1).withdraw({from: addresses[account1], value: 11000})
        ).to.be.revertedWith("Cannot withdraw more than the current balance");
    });

    it("should revert when caller is not the next payee", async function () {
        await contract.createGroup(addresses, names, 0);
        await contract.deposit({value: 10000});
        await contract.withdraw({from: addresses[account1], value: 5000});
        
        await expect(
            contract.connect(account1).withdraw({value: 1000})
        ).to.be.revertedWith("Caller is not the next payee");
    });

    it("should decrease group balance by message value when valid amount is provided", async function () {
        await contract.createGroup(addresses, names, 0);
        await contract.deposit({value: 10000});

        let originalbalance = await contract.groups[1].balance;
        originalbalance = originalbalance.toNumber();
        await contract
            .connect(account1)
            .withdraw({value: 5000});

        let laterbalance = await contract.groups[1].balance;
        laterbalance = laterbalance.toNumber();

        expect(laterbalance).to.equal(originalbalance - 5000);
    });

    it("should increase message sender's withdrawal by message value when valid amount is provided", async function () {        
        await contract.createGroup(addresses, names, 0);
        await contract.deposit({value: 10000});

        let originalwithdrawal = await contract.withdrawals(addresses[account1]);
        originalwithdrawal = originalwithdrawal.toNumber();
        await contract
            .connect(account1)
            .withdraw({value: 5000});

        let laterbalance = await contract.withdrawals(addresses[account1]);
        laterbalance = laterbalance.toNumber();

        expect(laterbalance).to.equal(originalbalance + 5000);
    });

    it("should change the payee to the next member", async function () {        
        await contract.createGroup(addresses, names, 0);
        await contract.deposit({value: 10000});
        await contract
            .connect(account1)
            .withdraw({value: 5000});

        expect(contract.groups[1].payee).to.equal(1);
    });
  });
  
  describe("dissolve", function () {
    it("should revert when caller is not the group owner", async function () {
        await contract.createGroup(addresses, names, 1);        
        
        await expect(
            contract.connect(account1).dissolve()
        ).to.be.revertedWith("Caller is not the group owner");
    });

    it("delete group information", async function () {        
        await contract.createGroup(addresses, names, 0);
        await contract.connect(account1).dissolve();

        expect(contract.groups[1].ownerIndex).to.equal(0);
  })
});
