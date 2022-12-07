import { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { vaultAbi } from "./abis/vaultAbi";
import { weightedPoolAbi } from "./abis/weightedPoolAbi";
import { erc20Abi } from "./abis/erc20Abi";
import { router } from "./abis/router";
import {
  VAULT_ADDRESS,
  JUKU7_POOL_ADDRESS,
  JUKU_POOL_ID,
  MAX_UINT,
  address,
  NETWORK_BUNDLE_ADDRESS,
  NETWORK_POOL_ID,
  USDC_FTM_POOL_ADDRESS,
  BATLE_ADDRESS,
  BATLE_POOL_ID,
  WFTM_ADDRESS,
  USDC_FTM_POOL_ID,
  LATE_ADDRESS,
  LATE_POOL_ID,
  SWAP_ROUTER,
} from "./constants";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { YieldOptimizer } from "../typechain-types";
import { BigNumber } from "ethers";

const provider = waffle.provider;

describe("Yield Optimizer tests", () => {
  let vault: any;
  let juku7: any;
  let accounts: SignerWithAddress[];
  let deployer: SignerWithAddress;
  let usdc: any;
  let yo: YieldOptimizer;
  let batlePool: any;
  let networkBundle: any;
  let latePool: any;
  let jukuToken: any;
  let spookyRouter: any;

  before("Init test environment", async () => {
    vault = await ethers.getContractAt(vaultAbi, VAULT_ADDRESS);
    juku7 = await ethers.getContractAt(weightedPoolAbi, JUKU7_POOL_ADDRESS);
    networkBundle = await ethers.getContractAt(
      weightedPoolAbi,
      NETWORK_BUNDLE_ADDRESS
    );
    batlePool = await ethers.getContractAt(weightedPoolAbi, BATLE_ADDRESS);
    latePool = await ethers.getContractAt(weightedPoolAbi, LATE_ADDRESS);
    usdc = await ethers.getContractAt(
      erc20Abi,
      "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75"
    );

    const [ownerAccount, ...others] = await ethers.getSigners();
    accounts = others;
    deployer = ownerAccount;
    const YO = await ethers.getContractFactory("YieldOptimizer");
    const JUKU = await ethers.getContractFactory("JUKU_ERC20");

    spookyRouter = await ethers.getContractAt(router, SWAP_ROUTER);
    jukuToken = await JUKU.deploy(
      ethers.utils.parseUnits("100000000.0", 18),
      0,
      deployer.address,
      []
    );
    const poolID = await juku7.getPoolId();
    yo = await YO.deploy(
      usdc.address,
      jukuToken.address,
      deployer.address,
      vault.address,
      spookyRouter.address,
      2000,
      3750,
      2500,
      3750
    );
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

    for (let i = 9; i < 18; i++) {
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
        amount: ethers.utils.parseUnits("20000.0", 18),
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
        value: ethers.utils.parseUnits("25000.0", 18),
      }
    );

    const usdcBalanceLiquidity = await usdc.balanceOf(accounts[8].address);
    await usdc
      .connect(accounts[8])
      .transfer(deployer.address, usdcBalanceLiquidity);

    await usdc.approve(spookyRouter.address, MAX_UINT);
    await jukuToken.approve(spookyRouter.address, MAX_UINT);

    await spookyRouter.addLiquidity(
      usdc.address,
      jukuToken.address,
      ethers.utils.parseUnits("2000.0", 6),
      ethers.utils.parseUnits("20000.0", 18),
      0,
      0,
      deployer.address,
      MAX_UINT
    );

    const balanceAfterLiquidity = await usdc.balanceOf(deployer.address);
    await usdc.transfer(yo.address, balanceAfterLiquidity);
  });

  describe("", async () => {
    describe("deploy tests", async () => {
      it("should deploy yo", async () => {
        const YO = await ethers.getContractFactory("YieldOptimizer");
        const yieldOptimizer = await YO.deploy(
          usdc.address,
          jukuToken.address,
          deployer.address,
          vault.address,
          spookyRouter.address,
          2000,
          3750,
          2500,
          3750
        );
        await expect(vault.address).to.equal(await yieldOptimizer.vault());
      });
      it("should revert deploy if passed zero address", async () => {
        const YO = await ethers.getContractFactory("YieldOptimizer");
        await expect(
          YO.deploy(
            usdc.address,
            jukuToken.address,
            deployer.address,
            address(0),
            spookyRouter.address,
            2000,
            3750,
            2500,
            3750
          )
        ).to.be.revertedWith("YO#001");
      });

      it("should revert deploy if invalid percent", async () => {
        const YO = await ethers.getContractFactory("YieldOptimizer");
        await expect(
          YO.deploy(
            usdc.address,
            jukuToken.address,
            deployer.address,
            vault.address,
            spookyRouter.address,
            20000,
            3750,
            2500,
            3750
          )
        ).to.be.revertedWith("YO#012");
      });
      it("should revert deploy if invalid allocation percent", async () => {
        const YO = await ethers.getContractFactory("YieldOptimizer");
        await expect(
          YO.deploy(
            usdc.address,
            jukuToken.address,
            deployer.address,
            vault.address,
            spookyRouter.address,
            2000,
            33750,
            2500,
            3750
          )
        ).to.be.revertedWith("YO#011");
      });
    });
    describe("add & update pool tests", async () => {
      let yieldOptimizer: YieldOptimizer;

      before(async () => {
        const YO = await ethers.getContractFactory("YieldOptimizer");
        yieldOptimizer = await YO.deploy(
          usdc.address,
          jukuToken.address,
          deployer.address,
          vault.address,
          spookyRouter.address,
          2000,
          3750,
          2500,
          3750
        );
      });
      it("should revert add pool if unequal array length", async () => {
        await expect(
          yieldOptimizer.addPool(
            JUKU_POOL_ID,
            JUKU7_POOL_ADDRESS,
            usdc.address,
            usdc.address,
            JUKU_POOL_ID,
            JUKU_POOL_ID,
            [
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
            ],
            0,
            true,
            true
          )
        ).to.be.revertedWith("YO#005");
      });
      it("should revert add pool if passed zero address", async () => {
        await expect(
          yieldOptimizer.addPool(
            JUKU_POOL_ID,
            address(0),
            usdc.address,
            usdc.address,
            JUKU_POOL_ID,
            JUKU_POOL_ID,
            [
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
            ],
            0,
            true,
            true
          )
        ).to.be.revertedWith("YO#001");
      });
      it("should add pool", async () => {
        await yieldOptimizer.addPool(
          JUKU_POOL_ID,
          JUKU7_POOL_ADDRESS,
          usdc.address,
          usdc.address,
          JUKU_POOL_ID,
          JUKU_POOL_ID,
          [
            JUKU_POOL_ID,
            JUKU_POOL_ID,
            JUKU_POOL_ID,
            JUKU_POOL_ID,
            JUKU_POOL_ID,
            JUKU_POOL_ID,
            JUKU_POOL_ID,
          ],
          0,
          true,
          true
        );
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.bptToken).to.be.equal(JUKU7_POOL_ADDRESS);
        expect(poolInfo.depositToken).to.be.equal(usdc.address);
        expect(poolInfo.exitToken).to.be.equal(usdc.address);
        expect(poolInfo.isActive).to.be.equal(true);
      });
      it("should revert add pool if pool is already added", async () => {
        await expect(
          yieldOptimizer.addPool(
            JUKU_POOL_ID,
            JUKU7_POOL_ADDRESS,
            usdc.address,
            usdc.address,
            JUKU_POOL_ID,
            JUKU_POOL_ID,
            [
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
              JUKU_POOL_ID,
            ],
            0,
            true,
            true
          )
        ).to.be.revertedWith("YO#004");
      });
      it("should update exit token index for pool", async () => {
        await yieldOptimizer.updateExitTokenIndex(JUKU7_POOL_ADDRESS, 2);
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.exitTokenIndex).to.be.equal(2);
      });
      it("should revert update exit token if invalid index", async () => {
        await expect(
          yieldOptimizer.updateExitTokenIndex(JUKU7_POOL_ADDRESS, 12)
        ).to.be.revertedWith("YO#008");
      });
      it("should update pool deposit type", async () => {
        await yieldOptimizer.updatePoolDepositType(JUKU7_POOL_ADDRESS, false);
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.isDepositInOneToken).to.be.equal(false);
      });
      it("should update pool allocations percents", async () => {
        const newCommisions = 1000;
        const newRewards = 2000;
        const newTreasury = 7000;
        const reinvest = 1000;
        await yieldOptimizer.updatePoolAllocationPercents(
          JUKU7_POOL_ADDRESS,
          reinvest,
          newCommisions,
          newRewards,
          newTreasury
        );
        const alloc = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);

        expect(alloc.allocations.reinvestedPercent).to.be.equal(reinvest);
        expect(alloc.allocations.rewardsPercent).to.be.equal(newRewards);
        expect(alloc.allocations.treasuryPercent).to.be.equal(newTreasury);
        expect(alloc.allocations.commisionsPercent).to.be.equal(newCommisions);
      });
      it("should update default allocations percents", async () => {
        const newCommisions = 1000;
        const newRewards = 2000;
        const newTreasury = 7000;
        const reinvest = 1000;
        await yieldOptimizer.updateDefaultAllocationPercents(
          reinvest,
          newCommisions,
          newRewards,
          newTreasury
        );
        const commisions = await yieldOptimizer.commisionsDefault();
        const treasury = await yieldOptimizer.treasuryDefault();
        const rewards = await yieldOptimizer.rewardsDefault();
        const reinvested = await yieldOptimizer.reinvestedDefault();
        expect(commisions).to.be.equal(newCommisions);
        expect(rewards).to.be.equal(newRewards);
        expect(treasury).to.be.equal(newTreasury);
        expect(reinvested).to.be.equal(reinvest);
      });
      it("should revert update allocations if invalid total percent", async () => {
        const newCommisions = 1000;
        const newRewards = 2000;
        const newTreasury = 8000;
        const reinvest = 1000;
        await expect(
          yieldOptimizer.updateDefaultAllocationPercents(
            reinvest,
            newCommisions,
            newRewards,
            newTreasury
          )
        ).to.be.revertedWith("YO#011");
      });

      it("should update swapRouter", async () => {
        await yieldOptimizer.updateSwapRouter(VAULT_ADDRESS);
        const sw = await yieldOptimizer.swapRouter();
        expect(sw).to.be.equal(VAULT_ADDRESS);
      });
      it("should revert update swap router if passed zero address", async () => {
        await expect(
          yieldOptimizer.updateSwapRouter(address(0))
        ).to.be.revertedWith("YO#001");
      });
      it("should update path to juku", async () => {
        const newPath = [jukuToken.address, usdc.address];
        await yieldOptimizer.updatePathToJuku(newPath);
        const token1 = await yieldOptimizer.pathToJuku(0);
        const token2 = await yieldOptimizer.pathToJuku(1);
        expect(newPath[0]).to.be.equal(token1);
        expect(newPath[1]).to.be.equal(token2);
      });
      it("should revert update pool deposit type if type already assigned", async () => {
        await expect(
          yieldOptimizer.updatePoolDepositType(JUKU7_POOL_ADDRESS, false)
        ).to.be.revertedWith("YO#007");
      });
      it("should update pool exit type", async () => {
        await yieldOptimizer.updatePoolExitType(JUKU7_POOL_ADDRESS, false);
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.isExitInOneToken).to.be.equal(false);
      });
      it("should revert update pool exit type if type already assigned", async () => {
        await expect(
          yieldOptimizer.updatePoolExitType(JUKU7_POOL_ADDRESS, false)
        ).to.be.revertedWith("YO#007");
      });
      it("should turn off pool", async () => {
        await yieldOptimizer.turnOffPool(JUKU7_POOL_ADDRESS);
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.isActive).to.be.equal(false);
      });
      it("should revert turn off is already off", async () => {
        await expect(
          yieldOptimizer.turnOffPool(JUKU7_POOL_ADDRESS)
        ).to.be.revertedWith("YO#007");
      });
      it("should turn on pool", async () => {
        await yieldOptimizer.turnOnPool(JUKU7_POOL_ADDRESS);
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.isActive).to.be.equal(true);
      });
      it("should revert turn on is already on", async () => {
        await expect(
          yieldOptimizer.turnOnPool(JUKU7_POOL_ADDRESS)
        ).to.be.revertedWith("YO#007");
      });
      it("should update admin", async () => {
        await yieldOptimizer.updateAdmin(accounts[1].address);
        await expect(await yieldOptimizer.admin()).to.be.equal(
          accounts[1].address
        );
      });
      it("should revert update admin if passed zero address", async () => {
        await expect(yieldOptimizer.updateAdmin(address(0))).to.be.revertedWith(
          "YO#001"
        );
      });
      it("should revert update admin if already added", async () => {
        await expect(
          yieldOptimizer.updateAdmin(accounts[1].address)
        ).to.be.revertedWith("YO#007");
      });
      it("should revert update if pool not added", async () => {
        await expect(
          yieldOptimizer
            .connect(deployer)
            .updateExitTokenIndex(USDC_FTM_POOL_ADDRESS, 0)
        ).to.be.revertedWith("YO#006");
      });
      it("should update exit token settings", async () => {
        await yieldOptimizer.updateExitTokenSettings(
          JUKU7_POOL_ADDRESS,
          WFTM_ADDRESS,
          USDC_FTM_POOL_ID,
          1
        );
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.exitTokenIndex).to.be.equal(1);
        expect(poolInfo.exitToken).to.be.equal(WFTM_ADDRESS);
        expect(poolInfo.swapRouteForExitToken).to.be.equal(USDC_FTM_POOL_ID);
      });
      it("should revert update exit token settings if passed zero address", async () => {
        await expect(
          yieldOptimizer.updateExitTokenSettings(
            JUKU7_POOL_ADDRESS,
            address(0),
            USDC_FTM_POOL_ID,
            1
          )
        ).to.be.revertedWith("YO#001");
      });
      it("should revert update exit token settings id passed invalid index", async () => {
        await expect(
          yieldOptimizer.updateExitTokenSettings(
            JUKU7_POOL_ADDRESS,
            WFTM_ADDRESS,
            USDC_FTM_POOL_ID,
            11
          )
        ).to.be.revertedWith("YO#008");
      });
      it("should update deposit token settings", async () => {
        await yieldOptimizer.updateDepositTokenSettings(
          JUKU7_POOL_ADDRESS,
          WFTM_ADDRESS,
          USDC_FTM_POOL_ID
        );
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.depositToken).to.be.equal(WFTM_ADDRESS);
        expect(poolInfo.swapRouteForDepositToken).to.be.equal(USDC_FTM_POOL_ID);
      });
      it("should revert update deposit token settings if passed zero address", async () => {
        await expect(
          yieldOptimizer.updateDepositTokenSettings(
            JUKU7_POOL_ADDRESS,
            address(0),
            USDC_FTM_POOL_ID
          )
        ).to.be.revertedWith("YO#001");
      });
      it("should update pool swap routes", async () => {
        const routes: string[] = [
          NETWORK_POOL_ID,
          NETWORK_POOL_ID,
          NETWORK_POOL_ID,
          NETWORK_POOL_ID,
          NETWORK_POOL_ID,
          NETWORK_POOL_ID,
          NETWORK_POOL_ID,
        ];
        await yieldOptimizer.updatePoolSwapRoutes(JUKU7_POOL_ADDRESS, routes);
        const poolRoutes = await yieldOptimizer.getPoolSwapRoutes(
          JUKU7_POOL_ADDRESS
        );
        for (let i = 0; i <= poolRoutes.length - 1; i++) {
          expect(poolRoutes[i]).to.be.equal(routes[i]);
        }
      });
      it("should revert update swap routes if invalid array lenghts", async () => {
        const routes: string[] = [
          NETWORK_POOL_ID,
          NETWORK_POOL_ID,
          NETWORK_POOL_ID,
          NETWORK_POOL_ID,
          NETWORK_POOL_ID,
          NETWORK_POOL_ID,
        ];
        await expect(
          yieldOptimizer.updatePoolSwapRoutes(JUKU7_POOL_ADDRESS, routes)
        ).to.be.revertedWith("YO#005");
      });
    });
    describe("test view methods", async () => {
      it("should usdcBalance return balance of usdc token", async () => {
        const balance = await usdc.balanceOf(yo.address);
        const methodBalance = await yo.usdcBalance();
        expect(balance).to.be.equal(methodBalance);
      });
      it("should return pool tokens", async () => {
        const poolTokens = await yo.getPoolTokens(JUKU7_POOL_ADDRESS);
        const tokens = [
          "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
          "0x1E4F97b9f9F913c46F1632781732927B9019C68b",
          "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
          "0x321162Cd933E2Be498Cd2267a90534A804051b11",
          "0x6a07A792ab2965C72a5B8088d3a069A7aC3a993B",
          "0x74b23882a30290451A17c44f4F05243b6b58C76d",
          "0xb3654dc3D10Ea7645f8319668E8F54d2574FBdC8",
        ];
        for (let i = 0; i <= poolTokens.length - 1; i++) {
          expect(tokens[i]).to.be.equal(poolTokens[i]);
        }
      });
      it("should return pool tokens weights", async () => {
        const poolWeights = await yo.getPoolWeights(JUKU7_POOL_ADDRESS);
        expect(poolWeights.length).to.be.equal(7);
      });
      it("should return true if pool is added", async () => {
        const pool = await yo.poolIsAdded(JUKU7_POOL_ADDRESS);
        expect(pool).to.be.equal(true);
      });
    });
    describe("invest & exit tests", async () => {
      it("should invest in juku7 pool", async () => {
        const usdcBalanceBefore = await usdc.balanceOf(yo.address);
        await yo.invest(
          JUKU7_POOL_ADDRESS,
          ethers.utils.parseUnits("10.0", 6),
          deployer.address,
          "user"
        );
        const bptBalance = await juku7.balanceOf(yo.address);
        const usdcBalanceAfter = await usdc.balanceOf(yo.address);
        expect(bptBalance).to.be.gt(ethers.utils.parseEther("0"));
        expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.be.equal(
          ethers.utils.parseUnits("10.0", 6)
        );
      });
      it("should withdraw from juku7", async () => {
        const bptBalanceBefore = await juku7.balanceOf(yo.address);
        const usdcBalanceBefore = await usdc.balanceOf(yo.address);
        await yo.withdrawFromPool(
          JUKU7_POOL_ADDRESS,
          bptBalanceBefore,
          deployer.address,
          "user"
        );
        const bptBalanceAfter = await juku7.balanceOf(yo.address);
        const usdcBalanceAfter = await usdc.balanceOf(yo.address);
        expect(usdcBalanceAfter).to.be.gt(usdcBalanceBefore);
        expect(bptBalanceAfter).to.be.equal(0);
      });
      it("should invest in networkBundle pool", async () => {
        const usdcBalanceBefore = await usdc.balanceOf(yo.address);
        await yo.invest(
          NETWORK_BUNDLE_ADDRESS,
          ethers.utils.parseUnits("10.0", 6),
          deployer.address,
          "user"
        );
        const bptBalance = await networkBundle.balanceOf(yo.address);
        const usdcBalanceAfter = await usdc.balanceOf(yo.address);
        expect(bptBalance).to.be.gt(ethers.utils.parseEther("0"));
        expect(usdcBalanceBefore.sub(usdcBalanceAfter)).to.be.equal(
          ethers.utils.parseUnits("10.0", 6)
        );
      });
      it("should withdraw from network bundle", async () => {
        const bptBalanceBefore = await networkBundle.balanceOf(yo.address);
        const usdcBalanceBefore = await usdc.balanceOf(yo.address);
        await yo.withdrawFromPool(
          NETWORK_BUNDLE_ADDRESS,
          bptBalanceBefore,
          deployer.address,
          "user"
        );
        const bptBalanceAfter = await networkBundle.balanceOf(yo.address);
        const usdcBalanceAfter = await usdc.balanceOf(yo.address);
        expect(usdcBalanceAfter).to.be.gt(usdcBalanceBefore);
        expect(bptBalanceAfter).to.be.equal(0);
      });
      it("should revert withdraw from pool if pool not have investments", async () => {
        await expect(
          yo.withdrawFromPool(
            NETWORK_BUNDLE_ADDRESS,
            ethers.utils.parseEther("1"),
            deployer.address,
            "user"
          )
        ).to.be.revertedWith("YO#002");
      });
      it("should revert invest in pool if not enough funds", async () => {
        await expect(
          yo.invest(
            NETWORK_BUNDLE_ADDRESS,
            ethers.utils.parseUnits("10000.0", 6),
            deployer.address,
            "user"
          )
        ).to.be.revertedWith("YO#002");
      });
      it("should revert invest if caller not owner or admin", async () => {
        await expect(
          yo
            .connect(accounts[2])
            .invest(
              NETWORK_BUNDLE_ADDRESS,
              ethers.utils.parseUnits("10.0", 6),
              deployer.address,
              "user"
            )
        ).to.be.revertedWith("YO#010");
      });
      it("should revert invest if pool not active or not added", async () => {
        await expect(
          yo.invest(
            USDC_FTM_POOL_ADDRESS,
            ethers.utils.parseUnits("10.0", 6),
            deployer.address,
            "user"
          )
        ).to.be.revertedWith("YO#003");
      });
      it("should deposit in pool in all tokens", async () => {
        const balanceUsdcBefore = await usdc.balanceOf(yo.address);
        await yo.addPool(
          BATLE_POOL_ID,
          BATLE_ADDRESS,
          WFTM_ADDRESS,
          WFTM_ADDRESS,
          USDC_FTM_POOL_ID,
          USDC_FTM_POOL_ID,
          [
            BATLE_POOL_ID,
            BATLE_POOL_ID,
            BATLE_POOL_ID,
            BATLE_POOL_ID,
            BATLE_POOL_ID,
          ],
          0,
          false,
          false
        );

        await yo.invest(
          BATLE_ADDRESS,
          ethers.utils.parseUnits("10.0", 6),
          deployer.address,
          "user"
        );
        const balanceUsdcAfter = await usdc.balanceOf(yo.address);
        expect(balanceUsdcBefore.sub(balanceUsdcAfter)).to.be.equal(
          ethers.utils.parseUnits("10.0", 6)
        );
      });
      it("should withdraw in all tokens", async () => {
        const balanceBPT = await batlePool.balanceOf(yo.address);
        yo.withdrawFromPool(
          BATLE_ADDRESS,
          balanceBPT,
          deployer.address,
          "user"
        );
        const balanceBPTAfter = await batlePool.balanceOf(yo.address);
        expect(balanceBPTAfter).to.be.equal(ethers.utils.parseEther("0"));
      });
      it("should deposit in pool in usdc", async () => {
        const balanceUsdcBefore = await usdc.balanceOf(yo.address);
        await yo.addPool(
          LATE_POOL_ID,
          LATE_ADDRESS,
          usdc.address,
          usdc.address,
          LATE_POOL_ID,
          LATE_POOL_ID,
          [LATE_POOL_ID, LATE_POOL_ID, LATE_POOL_ID, LATE_POOL_ID],
          0,
          true,
          true
        );

        await yo.invest(
          LATE_ADDRESS,
          ethers.utils.parseUnits("10.0", 6),
          deployer.address,
          "user"
        );
        const balanceUsdcAfter = await usdc.balanceOf(yo.address);
        expect(balanceUsdcBefore.sub(balanceUsdcAfter)).to.be.equal(
          ethers.utils.parseUnits("10.0", 6)
        );
      });
      it("should withdraw in usdc token", async () => {
        const balanceBPT = await latePool.balanceOf(yo.address);
        await yo.withdrawFromPool(
          LATE_ADDRESS,
          balanceBPT,
          deployer.address,
          "user"
        );
        const balanceBPTAfter = await latePool.balanceOf(yo.address);
        expect(balanceBPTAfter).to.be.equal(ethers.utils.parseEther("0"));
      });
      it("should withdraw usdc from YO", async () => {
        await yo.withdraw(
          usdc.address,
          ethers.utils.parseUnits("10", 6),
          accounts[2].address,
          "user"
        );
        const balance = await usdc.balanceOf(accounts[2].address);
        expect(balance).to.be.equal(ethers.utils.parseUnits("10", 6));
      });
      it("should revert withdraw usdc if zero amount", async () => {
        await expect(
          yo.withdraw(usdc.address, 0, accounts[2].address, "user")
        ).to.be.revertedWith("YO#000");
      });
      it("should withdraw frm from yo", async () => {
        await accounts[1].sendTransaction({
          to: yo.address,
          value: ethers.utils.parseEther("10"),
        });
        const ftmBalanceBefore = await provider.getBalance(yo.address);
        const userFtmBalance = await provider.getBalance(accounts[2].address);

        await yo.withdraw(
          address(0),
          ethers.utils.parseUnits("10", 18),
          accounts[2].address,
          "user"
        );

        const userFtmBalanceAfter = await provider.getBalance(
          accounts[2].address
        );
        const ftmBalanceAfter = await provider.getBalance(yo.address);

        expect(ftmBalanceAfter).to.equal(0);
        expect(userFtmBalanceAfter).to.equal(
          userFtmBalance.add(ftmBalanceBefore)
        );
      });
      it("should revert withdraw if not enough wtm", async () => {
        await expect(
          yo.withdraw(
            address(0),
            ethers.utils.parseUnits("100000000000", 18),
            accounts[2].address,
            "user"
          )
        ).to.be.revertedWith("YO#002");
      });
      it("should revert withdraw if not enough usdc", async () => {
        await expect(
          yo.withdraw(
            usdc.address,
            ethers.utils.parseUnits("100000000000.0", 6),
            accounts[2].address,
            "user"
          )
        ).to.be.revertedWith("YO#002");
      });
    });
    describe("test reward distribution and masterchef functionality", async () => {
      it("should distribute rewards", async () => {
        await yo.invest(
          JUKU7_POOL_ADDRESS,
          ethers.utils.parseUnits("100.0", 6),
          deployer.address,
          "user"
        );

        const bptBalance = await juku7.balanceOf(yo.address);
        const usdcBalanceBefore = await usdc.balanceOf(yo.address);
        const calcSwapFeeAmount = bptBalance
          .mul(BigNumber.from("2000"))
          .div(BigNumber.from("10000"));

        await yo.harvest(JUKU7_POOL_ADDRESS, calcSwapFeeAmount);
        const usdcBalanceAfter = await usdc.balanceOf(yo.address);
        const bptBalanceAfter = await juku7.balanceOf(yo.address);
        const epochInfo = await yo.poolRewards(JUKU7_POOL_ADDRESS, 0);
        const reinvest = calcSwapFeeAmount
          .mul(BigNumber.from("2000"))
          .div(BigNumber.from("10000"));
        expect(reinvest).to.be.equal(epochInfo.reinvestedBpt);
        expect(bptBalanceAfter).to.be.equal(
          bptBalance.sub(calcSwapFeeAmount.sub(reinvest))
        );
        expect(usdcBalanceAfter).to.be.gt(usdcBalanceBefore);
        const poolInfo = await yo.poolInfo(JUKU7_POOL_ADDRESS);
        const epochCounter = await yo.rewardsEpochCounter(JUKU7_POOL_ADDRESS);
        expect(poolInfo.currentEpoch).to.be.equal(epochCounter);
      });

      it("should allocate with pool allocations", async () => {
        const commisions = 2000;
        const rewards = 4000;
        const reinvested = 3000;
        const treasury = 4000;
        await yo.updatePoolAllocationPercents(
          JUKU7_POOL_ADDRESS,
          reinvested,
          commisions,
          rewards,
          treasury
        );
        await yo.invest(
          JUKU7_POOL_ADDRESS,
          ethers.utils.parseUnits("100.0", 6),
          deployer.address,
          "user"
        );
        const bptBalance = await juku7.balanceOf(yo.address);
        const usdcBalanceBefore = await usdc.balanceOf(yo.address);
        const calcSwapFeeAmount = bptBalance
          .mul(BigNumber.from("2000"))
          .div(BigNumber.from("10000"));
        await yo.harvest(JUKU7_POOL_ADDRESS, calcSwapFeeAmount);

        const usdcBalanceAfter = await usdc.balanceOf(yo.address);
        const bptBalanceAfter = await juku7.balanceOf(yo.address);
        const epochInfo = await yo.poolRewards(JUKU7_POOL_ADDRESS, 1);
        const reinvest = calcSwapFeeAmount
          .mul(BigNumber.from("3000"))
          .div(BigNumber.from("10000"));
        expect(reinvest).to.be.equal(epochInfo.reinvestedBpt);
        expect(bptBalanceAfter).to.be.equal(
          bptBalance.sub(calcSwapFeeAmount.sub(reinvest))
        );
        expect(usdcBalanceAfter).to.be.gt(usdcBalanceBefore);
        const poolInfo = await yo.poolInfo(JUKU7_POOL_ADDRESS);
        const epochCounter = await yo.rewardsEpochCounter(JUKU7_POOL_ADDRESS);
        expect(poolInfo.currentEpoch).to.be.equal(epochCounter);
      });

      it("should update pool allocation type", async () => {
        await yo.changePoolAllocationType(JUKU7_POOL_ADDRESS, true);
        const pool = await yo.poolInfo(JUKU7_POOL_ADDRESS);
        expect(pool.isDefaultAllocations).to.be.equal(true);
      });

      it("should revert update pool allocation type if already assigned", async () => {
        await expect(
          yo.changePoolAllocationType(JUKU7_POOL_ADDRESS, true)
        ).to.be.revertedWith("YO#007");
      });

      it("should revert harvest if balance not enough", async () => {
        await expect(
          yo.harvest(JUKU7_POOL_ADDRESS, ethers.utils.parseUnits("1000.0", 18))
        ).to.be.revertedWith("YO#002");
      });
      it("should revert harvest if zero amount", async () => {
        await expect(
          yo.harvest(JUKU7_POOL_ADDRESS, ethers.utils.parseUnits("0", 18))
        ).to.be.revertedWith("YO#000");
      });
    });
    describe("events tests", async () => {
      let yieldOptimizerEvents: YieldOptimizer;

      before(async () => {
        const YO = await ethers.getContractFactory("YieldOptimizer");
        yieldOptimizerEvents = await YO.deploy(
          usdc.address,
          jukuToken.address,
          deployer.address,
          vault.address,
          spookyRouter.address,
          2000,
          3750,
          2500,
          3750
        );
      });
      it("should emit event invest", async () => {
        await expect(
          yo.invest(
            LATE_ADDRESS,
            ethers.utils.parseUnits("10.0", 6),
            deployer.address,
            "user"
          )
        ).to.emit(yo, "Invest");
      });
      it("should emit event withdrawFromPool", async () => {
        const balanceBPT = await latePool.balanceOf(yo.address);
        await expect(
          yo.withdrawFromPool(
            LATE_ADDRESS,
            balanceBPT,
            deployer.address,
            "user"
          )
        ).to.emit(yo, "WithdrawFromPool");
      });
      it("should emit event harvest", async () => {
        const bptBalanceAfter = await juku7.balanceOf(yo.address);
        await expect(yo.harvest(JUKU7_POOL_ADDRESS, bptBalanceAfter)).to.emit(
          yo,
          "Harvest"
        );
      });
      it("should emit event withdraw", async () => {
        await expect(
          yo.withdraw(
            usdc.address,
            ethers.utils.parseUnits("10", 6),
            accounts[2].address,
            "user"
          )
        )
          .to.emit(yo, "Withdraw")
          .withArgs(
            usdc.address,
            ethers.utils.parseUnits("10", 6),
            accounts[2].address,
            "user"
          );
      });
      it("should emit addPool event", async () => {
        await expect(
          yieldOptimizerEvents.addPool(
            LATE_POOL_ID,
            LATE_ADDRESS,
            usdc.address,
            usdc.address,
            LATE_POOL_ID,
            LATE_POOL_ID,
            [LATE_POOL_ID, LATE_POOL_ID, LATE_POOL_ID, LATE_POOL_ID],
            0,
            true,
            true
          )
        ).to.emit(yieldOptimizerEvents, "AddPool");
      });
      it("should emit UpdatePoolExitTokenIndex event", async () => {
        await expect(yieldOptimizerEvents.updateExitTokenIndex(LATE_ADDRESS, 1))
          .to.emit(yieldOptimizerEvents, "UpdatePoolExitTokenIndex")
          .withArgs(LATE_ADDRESS, 1);
      });
      it("should emit UpdatePoolDepositType event", async () => {
        await expect(
          yieldOptimizerEvents.updatePoolDepositType(LATE_ADDRESS, false)
        )
          .to.emit(yieldOptimizerEvents, "UpdatePoolDepositType")
          .withArgs(LATE_ADDRESS, false);
      });
      it("should emit UpdatePoolExitType event", async () => {
        await expect(
          yieldOptimizerEvents.updatePoolExitType(LATE_ADDRESS, false)
        )
          .to.emit(yieldOptimizerEvents, "UpdatePoolExitType")
          .withArgs(LATE_ADDRESS, false);
      });
      it("should emit UpdatePoolSwapRoutes event", async () => {
        await expect(
          yieldOptimizerEvents.updatePoolSwapRoutes(LATE_ADDRESS, [
            LATE_POOL_ID,
            LATE_POOL_ID,
            LATE_POOL_ID,
            LATE_POOL_ID,
          ])
        )
          .to.emit(yieldOptimizerEvents, "UpdatePoolSwapRoutes")
          .withArgs(LATE_ADDRESS, [
            LATE_POOL_ID,
            LATE_POOL_ID,
            LATE_POOL_ID,
            LATE_POOL_ID,
          ]);
      });
      it("should emit UpdateDepositTokenSettings event", async () => {
        await expect(
          yieldOptimizerEvents.updateDepositTokenSettings(
            LATE_ADDRESS,
            WFTM_ADDRESS,
            USDC_FTM_POOL_ID
          )
        )
          .to.emit(yieldOptimizerEvents, "UpdateDepositTokenSettings")
          .withArgs(LATE_ADDRESS, USDC_FTM_POOL_ID, WFTM_ADDRESS);
      });
      it("should emit UpdateExitTokenSettings event", async () => {
        await expect(
          yieldOptimizerEvents.updateExitTokenSettings(
            LATE_ADDRESS,
            WFTM_ADDRESS,
            USDC_FTM_POOL_ID,
            0
          )
        )
          .to.emit(yieldOptimizerEvents, "UpdateExitTokenSettings")
          .withArgs(LATE_ADDRESS, USDC_FTM_POOL_ID, WFTM_ADDRESS, 0);
      });
      it("should emit TurnOffPool event", async () => {
        await expect(yieldOptimizerEvents.turnOffPool(LATE_ADDRESS))
          .to.emit(yieldOptimizerEvents, "TurnOffPool")
          .withArgs(LATE_ADDRESS, false);
      });
      it("should emit TurnOnPool event", async () => {
        await expect(yieldOptimizerEvents.turnOnPool(LATE_ADDRESS))
          .to.emit(yieldOptimizerEvents, "TurnOnPool")
          .withArgs(LATE_ADDRESS, true);
      });
      it("should emit UpdateAdmin event", async () => {
        await expect(yieldOptimizerEvents.updateAdmin(accounts[8].address))
          .to.emit(yieldOptimizerEvents, "UpdateAdmin")
          .withArgs(accounts[8].address);
      });
    });
  });
});
