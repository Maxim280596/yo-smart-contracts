import { expect } from "chai";
import { ethers, waffle } from "hardhat";
// import { BigNumberish } from "ethers";
import { vaultAbi } from "./abis/vaultAbi";
import { weightedPoolAbi } from "./abis/weightedPoolAbi";
import { erc20Abi } from "./abis/erc20Abi";
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
} from "./constants";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { YieldOptimizer } from "../typechain-types";

const provider = waffle.provider;

// function encodeJoinExitMockPool(
//   amountsIn: BigNumberish[],
//   minimumBPT: BigNumberish
// ): string {
//   return ethers.utils.defaultAbiCoder.encode(
//     ["uint256", "uint256[]", "uint256"],
//     [1, amountsIn, minimumBPT]
//   );
// }

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
    const poolID = await juku7.getPoolId();
    yo = await YO.deploy(usdc.address, deployer.address, vault.address);
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
      [poolID, poolID, poolID, poolID],
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
        amount: ethers.utils.parseUnits("1000.0", 18),
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
  });

  describe("", async () => {
    describe("deploy tests", async () => {
      it("should deploy yo", async () => {
        const YO = await ethers.getContractFactory("YieldOptimizer");
        const yieldOptimizer = await YO.deploy(
          usdc.address,
          deployer.address,
          vault.address
        );
        await expect(vault.address).to.equal(await yieldOptimizer.vault());
      });
      it("should revert deploy if passed zero address", async () => {
        const YO = await ethers.getContractFactory("YieldOptimizer");
        await expect(
          YO.deploy(usdc.address, deployer.address, address(0))
        ).to.be.revertedWith("YO: Zero Address");
      });
    });
    describe("add & update pool tests", async () => {
      let yieldOptimizer: YieldOptimizer;

      before(async () => {
        const YO = await ethers.getContractFactory("YieldOptimizer");
        yieldOptimizer = await YO.deploy(
          usdc.address,
          deployer.address,
          vault.address
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
        ).to.be.revertedWith("YO: Invalid array lengths");
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
        ).to.be.revertedWith("YO: Zero Address");
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
        ).to.be.revertedWith("YO: Pool already added");
      });
      it("should update exit token index for pool", async () => {
        await yieldOptimizer.updateExitTokenIndex(JUKU7_POOL_ADDRESS, 2);
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.exitTokenIndex).to.be.equal(2);
      });
      it("should revert update exit token if invalid index", async () => {
        await expect(
          yieldOptimizer.updateExitTokenIndex(JUKU7_POOL_ADDRESS, 12)
        ).to.be.revertedWith("YO: Invalid index");
      });
      it("should update pool deposit type", async () => {
        await yieldOptimizer.updatePoolDepositType(JUKU7_POOL_ADDRESS, false);
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.isDepositInOneToken).to.be.equal(false);
      });
      it("should revert update pool deposit type if type already assigned", async () => {
        await expect(
          yieldOptimizer.updatePoolDepositType(JUKU7_POOL_ADDRESS, false)
        ).to.be.revertedWith("YO: Value is already assigned");
      });
      it("should update pool exit type", async () => {
        await yieldOptimizer.updatePoolExitType(JUKU7_POOL_ADDRESS, false);
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.isExitInOneToken).to.be.equal(false);
      });
      it("should revert update pool exit type if type already assigned", async () => {
        await expect(
          yieldOptimizer.updatePoolExitType(JUKU7_POOL_ADDRESS, false)
        ).to.be.revertedWith("YO: Value is already assigned");
      });
      it("should update swap route for deposit token", async () => {
        await yieldOptimizer.updateSwapRouteForDepositToken(
          JUKU7_POOL_ADDRESS,
          NETWORK_POOL_ID
        );
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.swapRouteForDepositToken).to.be.equal(NETWORK_POOL_ID);
      });
      it("should update swap route for exit token", async () => {
        await yieldOptimizer.updateSwapRouteForExitToken(
          JUKU7_POOL_ADDRESS,
          NETWORK_POOL_ID
        );
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.swapRouteForExitToken).to.be.equal(NETWORK_POOL_ID);
      });
      it("should turn off pool", async () => {
        await yieldOptimizer.turnOffPool(JUKU7_POOL_ADDRESS);
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.isActive).to.be.equal(false);
      });
      it("should revert turn off is already off", async () => {
        await expect(
          yieldOptimizer.turnOffPool(JUKU7_POOL_ADDRESS)
        ).to.be.revertedWith("YO: Value is already assigned");
      });
      it("should turn on pool", async () => {
        await yieldOptimizer.turnOnPool(JUKU7_POOL_ADDRESS);
        const poolInfo = await yieldOptimizer.poolInfo(JUKU7_POOL_ADDRESS);
        expect(poolInfo.isActive).to.be.equal(true);
      });
      it("should revert turn on is already on", async () => {
        await expect(
          yieldOptimizer.turnOnPool(JUKU7_POOL_ADDRESS)
        ).to.be.revertedWith("YO: Value is already assigned");
      });
      it("should update admin", async () => {
        await yieldOptimizer.updateAdmin(accounts[1].address);
        await expect(await yieldOptimizer.admin()).to.be.equal(
          accounts[1].address
        );
      });
      it("should revert update admin if passed zero address", async () => {
        await expect(yieldOptimizer.updateAdmin(address(0))).to.be.revertedWith(
          "YO: Zero Address"
        );
      });
      it("should revert update admin if already added", async () => {
        await expect(
          yieldOptimizer.updateAdmin(accounts[1].address)
        ).to.be.revertedWith("Value already assigned");
      });
      it("should revert update if pool not added", async () => {
        await expect(
          yieldOptimizer
            .connect(deployer)
            .updateExitTokenIndex(USDC_FTM_POOL_ADDRESS, 0)
        ).to.be.revertedWith("YO: Pool not added");
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
        ).to.be.revertedWith("YO: Zero Address");
      });
      it("should revert update exit token settings id passed invalid index", async () => {
        await expect(
          yieldOptimizer.updateExitTokenSettings(
            JUKU7_POOL_ADDRESS,
            WFTM_ADDRESS,
            USDC_FTM_POOL_ID,
            11
          )
        ).to.be.revertedWith("YO: Invalid index");
        // });
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
        ).to.be.revertedWith("YO: Zero Address");
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
        ).to.be.revertedWith("YO: Invalid array lengths");
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
        ).to.be.revertedWith("YO: Not enough BPT");
      });
      it("should revert invest in pool if not enough funds", async () => {
        await expect(
          yo.invest(
            NETWORK_BUNDLE_ADDRESS,
            ethers.utils.parseUnits("10000.0", 6),
            deployer.address,
            "user"
          )
        ).to.be.revertedWith("YO: Not enough usdc");
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
        ).to.be.revertedWith("YO: Access is denied");
      });
      it("should revert invest if pool not active or not added", async () => {
        await expect(
          yo.invest(
            USDC_FTM_POOL_ADDRESS,
            ethers.utils.parseUnits("10.0", 6),
            deployer.address,
            "user"
          )
        ).to.be.revertedWith("YO: Pool not active");
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
        yo.withdrawFromPool(LATE_ADDRESS, balanceBPT, deployer.address, "user");
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
        ).to.be.revertedWith("YO: ZeroAmount");
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
        ).to.be.revertedWith("YO: Not enough tokens");
      });
      it("should revert withdraw if not enough usdc", async () => {
        await expect(
          yo.withdraw(
            usdc.address,
            ethers.utils.parseUnits("100000000000.0", 6),
            accounts[2].address,
            "user"
          )
        ).to.be.revertedWith("YO: Not enough tokens");
      });
    });
    describe("sale tests", async () => {
      it("get pool id", async () => {
        //   console.log(await yo.poolsCounter());
        //   const a = await yo.poolInfo(JUKU7_POOL_ADDRESS);
        //   console.log(await juku7.getPoolId());
        //   const poolID = await juku7.getPoolId();
        //   const poolTOkens = await vault.getPoolTokens(poolID);
        //   // console.log(poolTOkens);
        //   const joinPool = await vault.joinPool(
        //     poolID,
        //     deployer.address,
        //     deployer.address,
        //     {
        //       assets: [
        //         "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
        //         "0x1E4F97b9f9F913c46F1632781732927B9019C68b",
        //         "0x0000000000000000000000000000000000000000",
        //         "0x321162Cd933E2Be498Cd2267a90534A804051b11",
        //         "0x6a07A792ab2965C72a5B8088d3a069A7aC3a993B",
        //         "0x74b23882a30290451A17c44f4F05243b6b58C76d",
        //         "0xb3654dc3D10Ea7645f8319668E8F54d2574FBdC8",
        //       ],
        //       maxAmountsIn: [
        //         "0",
        //         "0",
        //         "10000000000000000000",
        //         "0",
        //         "0",
        //         "0",
        //         "0",
        //       ],
        //       fromInternalBalance: false,
        //       userData: encodeJoinExitMockPool(
        //         ["0", "0", "10000000000000000000", "0", "0", "0", "0"],
        //         0
        //       ),
        //     },
        //     {
        //       value: ethers.utils.parseUnits("10.0", 18),
        //     }
        //   );
        // });
        // it("should make batch swap", async () => {
        //   const poolID = await juku7.getPoolId();
        //   const poolTOkens = await vault.getPoolTokens(poolID);
        //   const sw = await vault.swap(
        //     {
        //       poolId: poolID,
        //       kind: 0,
        //       assetIn: address(0),
        //       assetOut: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
        //       amount: ethers.utils.parseUnits("1000.0", 18),
        //       userData: "0x",
        //     },
        //     {
        //       sender: deployer.address,
        //       fromInternalBalance: false,
        //       recipient: deployer.address,
        //       toInternalBalance: false,
        //     },
        //     1,
        //     MAX_UINT,
        //     {
        //       value: ethers.utils.parseUnits("1000.0", 18),
        //     }
        //   );
        //   const balance = await usdc.balanceOf(deployer.address);
        //   await usdc.approve(yo.address, MAX_UINT);
        //   await usdc.transfer(yo.address, balance.div(2));
        //   await yo.invest(
        //     JUKU7_POOL_ADDRESS,
        //     ethers.utils.parseUnits("10.0", 6),
        //     deployer.address,
        //     "rrrrr"
        //   );
        //   console.log("investtttttttttt");
        //   const tx = await yo.invest(
        //     NETWORK_BUNDLE_ADDRESS,
        //     ethers.utils.parseUnits("10.0", 6),
        //     deployer.address,
        //     "rrrrr"
        //   );
        //   const data: any = await tx.wait();
        //   const event1 = data.events?.filter((x: any) => {
        //     return x.event == "Invest";
        //   });
        // console.log(
        //   ethers.utils.parseBytes32String(
        //     "0xb41a49b10ff01988d3a8327b2e05a0a0f3bbfa2bc0d5dc8b1d8f4878d1018837"
        //   )
        // );
        // const balanceBPT = await juku7.balanceOf(yo.address);
        // const balanceBPTn = await networkBundle.balanceOf(yo.address);
        // // console.log(balanceBPT);
        // const balancesBefore = await yo.checkBalances([
        //   "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
        //   "0x1E4F97b9f9F913c46F1632781732927B9019C68b",
        //   "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
        //   "0x321162Cd933E2Be498Cd2267a90534A804051b11",
        //   "0x6a07A792ab2965C72a5B8088d3a069A7aC3a993B",
        //   "0x74b23882a30290451A17c44f4F05243b6b58C76d",
        //   "0xb3654dc3D10Ea7645f8319668E8F54d2574FBdC8",
        // ]);
        // console.log(balancesBefore, "balances");
        // await yo.withdrawFromPool(
        //   JUKU7_POOL_ADDRESS,
        //   balanceBPT,
        //   deployer.address,
        //   "rrrrr"
        // );
        // await yo.withdrawFromPool(
        //   NETWORK_BUNDLE_ADDRESS,
        //   balanceBPTn,
        //   deployer.address,
        //   "rrrrr"
        // );
        // const balance2 = await usdc.balanceOf(yo.address);
        // const balanceBPT2 = await juku7.balanceOf(yo.address);
        // console.log(balance2);
        // console.log(balanceBPT2);
        // const bptTotal = await juku7.totalSupply();
        // console.log(bptTotal);
        // const balances = await yo.checkBalances([
        //   "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
        //   "0x1E4F97b9f9F913c46F1632781732927B9019C68b",
        //   "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
        //   "0x321162Cd933E2Be498Cd2267a90534A804051b11",
        //   "0x6a07A792ab2965C72a5B8088d3a069A7aC3a993B",
        //   "0x74b23882a30290451A17c44f4F05243b6b58C76d",
        //   "0xb3654dc3D10Ea7645f8319668E8F54d2574FBdC8",
        // ]);
        // console.log(balances, "balances");
        // const exitBalances = await yo._calcBalance(balancesBefore, balances);
        // console.log(exitBalances, "exit");
        // console.log(await usdc.balanceOf(yo.address));
        // const poolIDs = await networkBundle.getPoolId();
        // const poolTOkenss = await vault.getPoolTokens(poolIDs);
        // console.log(poolTOkenss);
        // await yo.addPool(
        //   "0xdf02adb3cd587da89af29e58de70b840e49490250001000000000000000005b8",
        //   JUKU7_POOL_ADDRESS,
        //   [poolID, poolID, poolID, poolID, poolID, poolID, poolID]
        // );
        // 0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
        //       "0x1E4F97b9f9F913c46F1632781732927B9019C68b",
        //       "0x0000000000000000000000000000000000000000",
        //       "0x321162Cd933E2Be498Cd2267a90534A804051b11",
        //       "0x6a07A792ab2965C72a5B8088d3a069A7aC3a993B",
        //       "0x74b23882a30290451A17c44f4F05243b6b58C76d",
        //       "0xb3654dc3D10Ea7645f8319668E8F54d2574FBdC8",
        // const token1 = await ethers.getContractAt()
        // const tokens = [
        //   "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
        //   "0x1E4F97b9f9F913c46F1632781732927B9019C68b",
        //   "0x321162Cd933E2Be498Cd2267a90534A804051b11",
        //   //   "0x6a07A792ab2965C72a5B8088d3a069A7aC3a993B",
        //   //   "0x74b23882a30290451A17c44f4F05243b6b58C76d",
        //   //   "0xb3654dc3D10Ea7645f8319668E8F54d2574FBdC8",
        // ];
        // const limits = Array(tokens.length).fill(MAX_UINT);
        // await usdc.approve(vault.address, MAX_UINT);
        // const networkPoolId = await networkBundle.getPoolId();
        // const networkTokens = await vault.getPoolTokens(networkPoolId);
        // console.log(networkTokens);
        // const query = await vault.batchSwap(
        //   0,
        //   [
        //     {
        //       poolId: poolID,
        //       assetInIndex: 0,
        //       assetOutIndex: 2,
        //       amount: ethers.utils.parseUnits("2", 6),
        //       userData: "0x",
        //     },
        //     {
        //       poolId: networkPoolId,
        //       assetInIndex: 2,
        //       assetOutIndex: 1,
        //       amount: 0,
        //       userData: "0x",
        //     },
        //   ],
        //   [
        //     "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75".toLowerCase(),
        //     "0x40DF1Ae6074C35047BFF66675488Aa2f9f6384F3".toLowerCase(),
        //     "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83".toLowerCase(),
        //   ],
        //   {
        //     sender: deployer.address,
        //     recipient: deployer.address,
        //     fromInternalBalance: false,
        //     toInternalBalance: false,
        //   },
        //   [
        //     ethers.utils.parseUnits("10.0", 6),
        //     ethers.utils.parseUnits("10.0", 18),
        //     ethers.utils.parseUnits("10.0", 18),
        //   ],
        //   MAX_UINT
        // );
      });
    });
  });
});
