import { expect } from "chai";
import { ethers, waffle, upgrades } from "hardhat";
import { vaultAbi } from "./abis/vaultAbi";
import { weightedPoolAbi } from "./abis/weightedPoolAbi";
import { erc20Abi } from "./abis/erc20Abi";
import { spookySwapFactory } from "./abis/spookySwapFactory";
import { router } from "./abis/router";
import {
  VAULT_ADDRESS,
  JUKU7_POOL_ADDRESS,
  JUKU_POOL_ID,
  MAX_UINT,
  address,
  NETWORK_BUNDLE_ADDRESS,
  NETWORK_POOL_ID,
  SWAP_ROUTER,
  SWAP_FACTORY,
} from "./constants";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";

const provider = waffle.provider;

describe("Yield Optimizer Staking tests", () => {
  let vault: any;
  let accounts: SignerWithAddress[];
  let deployer: SignerWithAddress;
  let usdc: any;
  let yo: any;
  let jukuToken: any;
  let spookyRouter: any;
  let usdcJukuPairAddress: any;
  let yoStaking: any;
  let usdcJukuPairContract: any;
  let testToken: any;

  before("Init test environment", async () => {
    vault = await ethers.getContractAt(vaultAbi, VAULT_ADDRESS);
    usdc = await ethers.getContractAt(
      erc20Abi,
      "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75"
    );
    const [ownerAccount, ...others] = await ethers.getSigners();
    accounts = others;
    deployer = ownerAccount;
    const YO = await ethers.getContractFactory("YieldOptimizer");
    const YO_STAKING = await ethers.getContractFactory("YieldOptimizerStaking");
    const JUKU = await ethers.getContractFactory("JUKU_ERC20");
    const Token = await ethers.getContractFactory("Token");

    testToken = await Token.deploy(
      "Token",
      "Token",
      18,
      ethers.utils.parseUnits("1000000.0", 18)
    );
    spookyRouter = await ethers.getContractAt(router, SWAP_ROUTER);
    jukuToken = await JUKU.deploy(
      ethers.utils.parseUnits("100000000.0", 18),
      0,
      deployer.address,
      []
    );
    const poolID = JUKU_POOL_ID;
    const yoDep: any = await upgrades.deployProxy(
      YO,
      [
        usdc.address,
        jukuToken.address,
        deployer.address,
        vault.address,
        spookyRouter.address,
        deployer.address,
        2000,
        3750,
        2500,
        3750,
      ],
      { initializer: "initialize", kind: "uups" }
    );
    yo = yoDep;

    await yo.addPool(
      "0xdf02adb3cd587da89af29e58de70b840e49490250001000000000000000005b8",
      JUKU7_POOL_ADDRESS,
      usdc.address,
      usdc.address,
      poolID,
      poolID,
      [poolID, poolID, poolID, poolID, poolID, poolID, poolID],
      0,
      false,
      false
    );

    await yo.addPool(
      "0x0e41768de15cccc1715fe8aefb6f948349427c140001000000000000000005b9",
      NETWORK_BUNDLE_ADDRESS,
      "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
      "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
      "0xcdf68a4d525ba2e90fe959c74330430a5a6b8226000200000000000000000008",
      "0xcdf68a4d525ba2e90fe959c74330430a5a6b8226000200000000000000000008",
      [NETWORK_POOL_ID, NETWORK_POOL_ID, NETWORK_POOL_ID, NETWORK_POOL_ID],
      0,
      true,
      true
    );

    await vault.swap(
      {
        poolId: poolID,
        kind: 0,
        assetIn: address(0),
        assetOut: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
        amount: ethers.utils.parseUnits("1500.0", 18),
        userData: "0x",
      },
      {
        sender: deployer.address,
        fromInternalBalance: false,
        recipient: deployer.address,
        toInternalBalance: false,
      },
      1,
      MAX_UINT,
      {
        value: ethers.utils.parseUnits("5000.0", 18),
      }
    );
    const balance = await usdc.balanceOf(deployer.address);

    await usdc.approve(yo.address, MAX_UINT);
    await usdc.transfer(yo.address, balance);

    for (let i = 2; i < 8; i++) {
      await accounts[i].sendTransaction({
        to: accounts[8].address,
        value: ethers.utils.parseEther("9000"),
      });
    }

    await vault.connect(accounts[8]).swap(
      {
        poolId: poolID,
        kind: 0,
        assetIn: address(0),
        assetOut: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
        amount: ethers.utils.parseUnits("30000.0", 18),
        userData: "0x",
      },
      {
        sender: accounts[8].address,
        fromInternalBalance: false,
        recipient: accounts[8].address,
        toInternalBalance: false,
      },
      1,
      MAX_UINT,
      {
        value: ethers.utils.parseUnits("35000.0", 18),
      }
    );

    const usdcBalanceLiquidity = await usdc.balanceOf(accounts[8].address);
    await usdc
      .connect(accounts[8])
      .transfer(deployer.address, usdcBalanceLiquidity);

    await usdc.approve(spookyRouter.address, MAX_UINT);
    await jukuToken.approve(spookyRouter.address, MAX_UINT);

    await spookyRouter.addLiquidity(
      jukuToken.address,
      usdc.address,
      ethers.utils.parseUnits("30000.0", 18),
      ethers.utils.parseUnits("3000.0", 6),
      0,
      0,
      deployer.address,
      MAX_UINT
    );

    const balanceAfterLiquidity = await usdc.balanceOf(deployer.address);
    await usdc.transfer(yo.address, balanceAfterLiquidity);
    await jukuToken.transfer(
      yo.address,
      ethers.utils.parseUnits("20000.0", 18)
    );
    const factory = await ethers.getContractAt(spookySwapFactory, SWAP_FACTORY);
    usdcJukuPairAddress = await factory.getPair(
      usdc.address,
      jukuToken.address
    );
    usdcJukuPairContract = await ethers.getContractAt(
      erc20Abi,
      usdcJukuPairAddress
    );
    yoStaking = await upgrades.deployProxy(
      YO_STAKING,
      [
        jukuToken.address,
        usdc.address,
        usdcJukuPairAddress,
        spookyRouter.address,
        yo.address,
        deployer.address,
        deployer.address,
        5000,
        6000,
        4000,
      ],
      { initializer: "initialize", kind: "uups" }
    );

    await yo.setStaking(yoStaking.address);

    usdcJukuPairContract = await ethers.getContractAt(
      erc20Abi,
      usdcJukuPairAddress
    );
  });
  describe("", async () => {
    describe("test deploy", async () => {
      it("should revert deploy if passed zero address", async () => {
        const STAKING = await ethers.getContractFactory(
          "YieldOptimizerStaking"
        );
        await expect(
          upgrades.deployProxy(
            STAKING,
            [
              address(0),
              usdc.address,
              usdcJukuPairAddress,
              spookyRouter.address,
              yo.address,
              deployer.address,
              deployer.address,
              5000,
              6000,
              4000,
            ],
            { initializer: "initialize", kind: "uups" }
          )
        ).to.be.revertedWith("YO#001");
      });
      it("should revert deploy if passed invalid reinvested percent", async () => {
        const STAKING = await ethers.getContractFactory(
          "YieldOptimizerStaking"
        );
        await expect(
          upgrades.deployProxy(
            STAKING,
            [
              jukuToken.address,
              usdc.address,
              usdcJukuPairAddress,
              spookyRouter.address,
              yo.address,
              deployer.address,
              deployer.address,
              15000,
              6000,
              4000,
            ],
            { initializer: "initialize", kind: "uups" }
          )
        ).to.be.revertedWith("YO#012");
      });
      it("should revert deploy if passed invalid  percent for allocations", async () => {
        const STAKING = await ethers.getContractFactory(
          "YieldOptimizerStaking"
        );
        await expect(
          upgrades.deployProxy(
            STAKING,
            [
              jukuToken.address,
              usdc.address,
              usdcJukuPairAddress,
              spookyRouter.address,
              yo.address,
              deployer.address,
              deployer.address,
              5000,
              7000,
              4000,
            ],
            { initializer: "initialize", kind: "uups" }
          )
        ).to.be.revertedWith("YO#011");
      });
    });
    describe("test deposit", async () => {
      it("should deposit in usdc token", async () => {
        const balanceBefore = await usdc.balanceOf(yo.address);
        const balanceBeforeLiquidity = await usdcJukuPairContract.balanceOf(
          yo.address
        );
        const amount = ethers.utils.parseUnits("10.0", 6);
        await yoStaking.invest(usdc.address, amount, deployer.address, "user");
        const balanceAfter = await usdc.balanceOf(yo.address);
        const balanceAfterLiquidity = await usdcJukuPairContract.balanceOf(
          yo.address
        );
        expect(balanceBefore.sub(balanceAfter)).to.be.equal(amount);
        expect(balanceAfterLiquidity).to.be.gt(balanceBeforeLiquidity);
      });
      it("should deposit in juku token", async () => {
        const balanceBefore = await jukuToken.balanceOf(yo.address);
        const balanceBeforeLiquidity = await usdcJukuPairContract.balanceOf(
          yo.address
        );
        const amount = ethers.utils.parseUnits("10.0", 18);
        await yoStaking.invest(
          jukuToken.address,
          amount,
          deployer.address,
          "user"
        );
        const balanceAfter = await jukuToken.balanceOf(yo.address);
        const balanceAfterLiquidity = await usdcJukuPairContract.balanceOf(
          yo.address
        );
        expect(balanceBefore.sub(balanceAfter)).to.be.equal(amount);
        expect(balanceAfterLiquidity).to.be.gt(balanceBeforeLiquidity);
      });
      it("should revert deposit if invalid token passed", async () => {
        const amount = ethers.utils.parseUnits("10.0", 18);
        await expect(
          yoStaking.invest(testToken.address, amount, deployer.address, "user")
        ).to.be.revertedWith("YO#004");
      });
      it("should revert  if zero amount passed", async () => {
        const amount = ethers.utils.parseUnits("0", 18);
        await expect(
          yoStaking.invest(jukuToken.address, amount, deployer.address, "user")
        ).to.be.revertedWith("YO#000");
      });
      it("should deposit from autoInvest method", async () => {
        const balanceBefore = await usdc.balanceOf(yo.address);
        const balanceBeforeLiquidity = await usdcJukuPairContract.balanceOf(
          yo.address
        );
        const amount = ethers.utils.parseUnits("10.0", 6);
        await yoStaking.autoInvest(usdc.address, amount);
        const balanceAfter = await usdc.balanceOf(yo.address);
        const balanceAfterLiquidity = await usdcJukuPairContract.balanceOf(
          yo.address
        );
        expect(balanceBefore.sub(balanceAfter)).to.be.equal(amount);
        expect(balanceAfterLiquidity).to.be.gt(balanceBeforeLiquidity);
      });
      it("should revert deposit form autoInvest if invalid token passed", async () => {
        const amount = ethers.utils.parseUnits("10.0", 18);
        await expect(
          yoStaking.autoInvest(testToken.address, amount)
        ).to.be.revertedWith("YO#004");
      });
      it("should revertautoInvest if zero amount passed", async () => {
        const amount = ethers.utils.parseUnits("0", 18);
        await expect(
          yoStaking.autoInvest(jukuToken.address, amount)
        ).to.be.revertedWith("YO#000");
      });
    });
    describe("test withdraw", async () => {
      it("should withdraw from staking in usdc", async () => {
        const withdrawAmount = await usdcJukuPairContract.balanceOf(yo.address);
        const balanceBefore = await usdc.balanceOf(yo.address);
        await yoStaking.withdrawFromStaking(
          usdc.address,
          withdrawAmount.div(BigNumber.from("4")),
          deployer.address,
          "user"
        );
        const balanceAfter = await usdc.balanceOf(yo.address);
        const withdrawAmountAfter = await usdcJukuPairContract.balanceOf(
          yo.address
        );
        expect(
          withdrawAmount.sub(withdrawAmount.div(BigNumber.from("4")))
        ).to.be.equal(withdrawAmountAfter);
        expect(balanceAfter).to.be.gt(balanceBefore);
      });
      it("should withdraw from staking in Juku", async () => {
        const withdrawAmount = await usdcJukuPairContract.balanceOf(yo.address);
        const balanceBefore = await jukuToken.balanceOf(yo.address);
        await yoStaking.withdrawFromStaking(
          jukuToken.address,
          withdrawAmount.div(BigNumber.from("4")),
          deployer.address,
          "user"
        );
        const balanceAfter = await jukuToken.balanceOf(yo.address);
        const withdrawAmountAfter = await usdcJukuPairContract.balanceOf(
          yo.address
        );
        expect(
          withdrawAmount.sub(withdrawAmount.div(BigNumber.from("4")))
        ).to.be.equal(withdrawAmountAfter);
        expect(balanceAfter).to.be.gt(balanceBefore);
      });
      it("should reveret if withdraw if zero amount passed", async () => {
        await expect(
          yoStaking.withdrawFromStaking(
            usdc.address,
            ethers.utils.parseUnits("0", 18),
            deployer.address,
            "user"
          )
        ).to.be.revertedWith("YO#000");
      });
      it("should reveret if withdraw if invalid token address passed", async () => {
        await expect(
          yoStaking.withdrawFromStaking(
            testToken.address,
            ethers.utils.parseUnits("10", 18),
            deployer.address,
            "user"
          )
        ).to.be.revertedWith("YO#004");
      });
      it("should emergency withdraw usdc from YO STAKING", async () => {
        await jukuToken.transfer(
          yoStaking.address,
          ethers.utils.parseUnits("1000.0", 18)
        );
        await yoStaking.emergencyWithdraw(
          jukuToken.address,
          ethers.utils.parseUnits("100", 18),
          accounts[2].address
        );
        const balance = await jukuToken.balanceOf(accounts[2].address);
        expect(balance).to.be.equal(ethers.utils.parseUnits("100", 18));
      });
      it("should emergencyWithdraw ftm from yo staking", async () => {
        await accounts[1].sendTransaction({
          to: yoStaking.address,
          value: ethers.utils.parseEther("10"),
        });
        const ftmBalanceBefore = await provider.getBalance(yoStaking.address);
        const userFtmBalance = await provider.getBalance(accounts[2].address);

        await yoStaking.emergencyWithdraw(
          address(0),
          ftmBalanceBefore,
          accounts[2].address
        );

        const userFtmBalanceAfter = await provider.getBalance(
          accounts[2].address
        );
        const ftmBalanceAfter = await provider.getBalance(yoStaking.address);

        expect(ftmBalanceAfter).to.equal(0);
        expect(userFtmBalanceAfter).to.equal(
          userFtmBalance.add(ftmBalanceBefore)
        );
      });
      it("should revert emergencyWithdraw if not enough wtm", async () => {
        await expect(
          yoStaking.emergencyWithdraw(
            address(0),
            ethers.utils.parseUnits("100000000000", 18),
            accounts[2].address
          )
        ).to.be.revertedWith("YO#002");
      });
      it("should revert emergencyWithdraw if not enough usdc", async () => {
        await expect(
          yo.emergencyWithdraw(
            usdc.address,
            ethers.utils.parseUnits("100000000000.0", 6),
            accounts[0].address
          )
        ).to.be.revertedWith("YO#002");
      });
    });
    describe("test harvest and allocations", async () => {
      it("should harvest swap fees", async () => {
        const balance = await usdcJukuPairContract.balanceOf(yo.address);

        const usdcBalanceBefore = await usdc.balanceOf(yo.address);
        await yoStaking.harvest(balance);
        const usdcBalanceAfter = await usdc.balanceOf(yo.address);
        const lptBalanceAfter = await usdcJukuPairContract.balanceOf(
          yo.address
        );
        const epochInfo = await yoStaking.swapFeesAllocations(0);
        const reinvest = balance
          .mul(BigNumber.from("5000"))
          .div(BigNumber.from("10000"));
        expect(reinvest).to.be.equal(epochInfo.reinvestedLPT);
        expect(lptBalanceAfter).to.be.equal(reinvest);
        expect(usdcBalanceAfter).to.be.gt(usdcBalanceBefore);
      });
      it("should revert harvest if passed zero amount", async () => {
        await expect(
          yoStaking.harvest(ethers.utils.parseUnits("0", 18))
        ).to.be.revertedWith("YO#000");
      });
    });
    describe("test update methods", async () => {
      it("should update revenue recipient address", async () => {
        await yoStaking.updateRevenueRecipient(accounts[1].address);
        const revenueRecipient = await yoStaking.revenueRecipient();
        expect(revenueRecipient).to.be.equal(accounts[1].address);
      });
      it("should revert update revenue recipient if passed zero address", async () => {
        await expect(
          yoStaking.updateRevenueRecipient(address(0))
        ).to.be.revertedWith("YO#001");
      });
      it("should update allocations", async () => {
        const reinvest = 4000;
        const treasury = 5000;
        const commisions = 5000;
        await yoStaking.updateDefaultAllocationPercents(
          reinvest,
          commisions,
          treasury
        );
        const allocations = await yoStaking.defaultAllocations();
        expect(reinvest).to.be.equal(allocations.reinvestedPercent);
        expect(commisions).to.be.equal(allocations.commisionsPercent);
        expect(treasury).to.be.equal(allocations.treasuryPercent);
      });
      it("should revert update allocations if invalid percent", async () => {
        const reinvest = 4000;
        const treasury = 6000;
        const commisions = 5000;
        await expect(
          yoStaking.updateDefaultAllocationPercents(
            reinvest,
            commisions,
            treasury
          )
        ).to.be.revertedWith("YO#011");
      });
      it("should revert update allocations if invalid reinvest percent", async () => {
        const reinvest = 11000;
        const treasury = 5000;
        const commisions = 5000;
        await expect(
          yoStaking.updateDefaultAllocationPercents(
            reinvest,
            commisions,
            treasury
          )
        ).to.be.revertedWith("YO#012");
      });
      it("should update admin", async () => {
        await yoStaking.updateAdmin(accounts[1].address);
        await expect(await yoStaking.adminWallet()).to.be.equal(
          accounts[1].address
        );
      });
      it("should revert update admin if already added", async () => {
        await expect(
          yoStaking.updateAdmin(accounts[1].address)
        ).to.be.revertedWith("YO#007");
        await yoStaking.updateAdmin(deployer.address);
      });
      it("should revert update admin if passed zero address", async () => {
        await expect(yoStaking.updateAdmin(address(0))).to.be.revertedWith(
          "YO#001"
        );
      });
      it("should update swap router", async () => {
        await yoStaking.updateSwapRouter(accounts[1].address);
        const swapRouterNew = await yoStaking.swapRouter();
        expect(swapRouterNew).to.be.equal(accounts[1].address);
      });
      it("should revert update swap router if already assigned", async () => {
        await expect(
          yoStaking.updateSwapRouter(accounts[1].address)
        ).to.be.revertedWith("YO#007");
      });
      it("should revert update swap router if passed zero address", async () => {
        await expect(yoStaking.updateSwapRouter(address(0))).to.be.revertedWith(
          "YO#001"
        );
        await yoStaking.updateSwapRouter(spookyRouter.address);
      });
      it("should update path to juku token", async () => {
        const newPath = [jukuToken.address, usdc.address];
        await yoStaking.updatePathToJuku(newPath);
        const path1 = await yoStaking.pathToJuku(0);
        const path2 = await yoStaking.pathToJuku(1);
        expect(path1).to.be.equal(newPath[0]);
        expect(path2).to.be.equal(newPath[1]);

        await yoStaking.updatePathToJuku([usdc.address, jukuToken.address]);
      });
      it("should update path to usdc token", async () => {
        const newPath = [usdc.address, jukuToken.address];
        await yoStaking.updatePathToUsdc(newPath);
        const path1 = await yoStaking.pathToUsdc(0);
        const path2 = await yoStaking.pathToUsdc(1);
        expect(path1).to.be.equal(newPath[0]);
        expect(path2).to.be.equal(newPath[1]);

        await yoStaking.updatePathToUsdc([jukuToken.address, usdc.address]);
      });
      it("should update yo contract", async () => {
        await yoStaking.updateYO(accounts[1].address);
        const yoAddress = await yoStaking.yo();
        expect(yoAddress).to.be.equal(accounts[1].address);
        await yoStaking.updateYO(yo.address);
      });
      it("should revert update yo if caller not the admin or owner", async () => {
        await expect(
          yoStaking.connect(accounts[2]).updateYO(accounts[1].address)
        ).to.be.revertedWith("YO#010");
      });
      it("should revert update yo if value already assigned", async () => {
        await expect(yoStaking.updateYO(yo.address)).to.be.revertedWith(
          "YO#007"
        );
      });
      it("should revert update yo if passed zero address", async () => {
        await expect(yoStaking.updateYO(address(0))).to.be.revertedWith(
          "YO#001"
        );
      });
      it("should update usdc address", async () => {
        await yoStaking.updateUsdcAddress(testToken.address);
        const newUsdc = await yoStaking.usdcToken();
        expect(testToken.address).to.be.equal(newUsdc);
        await yoStaking.updateUsdcAddress(usdc.address);
      });
      it("should revert update usdc if passed zero address", async () => {
        await expect(
          yoStaking.updateUsdcAddress(address(0))
        ).to.be.revertedWith("YO#001");
      });
      it("should revert update usdc if value already assigned", async () => {
        await expect(
          yoStaking.updateUsdcAddress(usdc.address)
        ).to.be.revertedWith("YO#007");
      });
      it("should update juku address", async () => {
        await yoStaking.updateJukuAddress(testToken.address);
        const newJuku = await yoStaking.jukuToken();
        expect(testToken.address).to.be.equal(newJuku);
        await yoStaking.updateJukuAddress(jukuToken.address);
      });
      it("should revert update juku if passed zero address", async () => {
        await expect(
          yoStaking.updateJukuAddress(address(0))
        ).to.be.revertedWith("YO#001");
      });
      it("should revert update juku if value already assigned", async () => {
        await expect(
          yoStaking.updateJukuAddress(jukuToken.address)
        ).to.be.revertedWith("YO#007");
      });
      it("should update pair address", async () => {
        await yoStaking.updatePair(testToken.address);
        const newPair = await yoStaking.usdcJukuPair();
        expect(testToken.address).to.be.equal(newPair);
        await yoStaking.updatePair(usdcJukuPairAddress);
      });
      it("should revert update juku if passed zero address", async () => {
        await expect(yoStaking.updatePair(address(0))).to.be.revertedWith(
          "YO#001"
        );
      });
      it("should revert update juku if value already assigned", async () => {
        await expect(
          yoStaking.updatePair(usdcJukuPairAddress)
        ).to.be.revertedWith("YO#007");
      });
    });
    describe("test pausable functionality", async () => {
      it("should set pause", async () => {
        await yoStaking.pause();
        await expect(
          yoStaking.invest(
            jukuToken.address,
            ethers.utils.parseUnits("10.0", 18),
            deployer.address,
            "user"
          )
        ).to.be.revertedWith("Pausable: paused");
        await expect(await yoStaking.paused()).to.be.equal(true);
      });
      it("should set unpause", async () => {
        await yoStaking.unPause();
        const implementation = await yoStaking.getImplementation();
        expect(implementation).to.be.not.equal(address(0));
        await expect(
          yoStaking.invest(
            jukuToken.address,
            ethers.utils.parseUnits("10.0", 18),
            deployer.address,
            "user"
          )
        ).to.be.not.reverted;
        await expect(await yoStaking.paused()).to.be.equal(false);
      });
    });
    describe("test emitted events", async () => {
      it("should emit event Invest", async () => {
        await expect(
          yoStaking.invest(
            usdc.address,
            ethers.utils.parseUnits("10.0", 6),
            deployer.address,
            "user"
          )
        ).to.emit(yoStaking, "Invest");
      });
      it("should emit event WithdrawFromStaking", async () => {
        const balanceLP = await usdcJukuPairContract.balanceOf(yo.address);
        await expect(
          yoStaking.withdrawFromStaking(
            usdc.address,
            balanceLP.div(BigNumber.from("2")),
            deployer.address,
            "user"
          )
        ).to.emit(yoStaking, "WithdrawFromStaking");
      });
      it("should emit event Harvest", async () => {
        const lpBalanceAfter = await usdcJukuPairContract.balanceOf(yo.address);
        await expect(yoStaking.harvest(lpBalanceAfter)).to.emit(
          yoStaking,
          "Harvest"
        );
      });
      it("should emit event EmergencyWithdraw", async () => {
        const balance = await jukuToken.balanceOf(yoStaking.address);
        await expect(
          yoStaking.emergencyWithdraw(
            jukuToken.address,
            balance,
            accounts[1].address
          )
        )
          .to.emit(yoStaking, "EmergencyWithdraw")
          .withArgs(jukuToken.address, balance, accounts[1].address);
      });
      it("should emit event UpdateRevenueRecipient ", async () => {
        await expect(yoStaking.updateRevenueRecipient(accounts[10].address))
          .to.emit(yoStaking, "UpdateRevenueRecipient")
          .withArgs(accounts[10].address);
      });
      it("should emit UpdateAdminWallet event", async () => {
        await expect(yoStaking.updateAdmin(accounts[8].address))
          .to.emit(yoStaking, "UpdateAdminWallet")
          .withArgs(accounts[8].address);
      });
      it("should emit event UpdateDefaultAllocationPercents", async () => {
        await expect(
          yoStaking.updateDefaultAllocationPercents(1000, 2000, 8000)
        )
          .to.emit(yoStaking, "UpdateDefaultAllocation")
          .withArgs(1000, 2000, 8000);
      });
      it("should emit event UpdateSwapRouter", async () => {
        await expect(yoStaking.updateSwapRouter(accounts[1].address))
          .to.emit(yoStaking, "UpdateSwapRouter")
          .withArgs(accounts[1].address);
      });
      it("should emit event UpdatePathToJuku", async () => {
        await expect(
          yoStaking.updatePathToJuku([jukuToken.address, jukuToken.address])
        )
          .to.emit(yoStaking, "UpdatePathToJuku")
          .withArgs([jukuToken.address, jukuToken.address]);
      });
      it("should emit event UpdatePathToUsdc", async () => {
        await expect(
          yoStaking.updatePathToUsdc([jukuToken.address, jukuToken.address])
        )
          .to.emit(yoStaking, "UpdatePathToUsdc")
          .withArgs([jukuToken.address, jukuToken.address]);
      });
      it("should emit event UpdateYO", async () => {
        await expect(yoStaking.updateYO(accounts[1].address))
          .to.emit(yoStaking, "UpdateYO")
          .withArgs(accounts[1].address);
      });
      it("should emit event UpdateUsdcAddress", async () => {
        await expect(yoStaking.updateUsdcAddress(accounts[1].address))
          .to.emit(yoStaking, "UpdateUsdcAddress")
          .withArgs(accounts[1].address);
      });
      it("should emit event UpdateJukuAddress", async () => {
        await expect(yoStaking.updateJukuAddress(accounts[1].address))
          .to.emit(yoStaking, "UpdateJukuAddress")
          .withArgs(accounts[1].address);
      });
      it("should emit event UpdatePair", async () => {
        await expect(yoStaking.updatePair(accounts[1].address))
          .to.emit(yoStaking, "UpdatePair")
          .withArgs(accounts[1].address);
      });
    });
    describe("should upgrade implementation", async () => {
      it("upgrade", async () => {
        const newImplementation = await ethers.getContractFactory(
          "YieldOptimizerStakingV2"
        );
        yoStaking = await upgrades.upgradeProxy(
          yoStaking.address,
          newImplementation
        );
        const epochCount = await yoStaking.epochCounter();
        const implementation = await yoStaking.getImplementation();
        expect(implementation).to.be.not.equal(address(0));
        expect(epochCount).to.be.gt(0);
        const upgrade = await yoStaking.upgraded();
        expect(upgrade).to.be.equal(true);
      });
    });
  });
});
