import { MAX_INT, MAX_UINT } from "./../test/constants";
import { router } from "./../test/abis/router";
import { ethers, upgrades } from "hardhat";
import { verifyContract } from "./verify";
import { BigNumberish } from "ethers";

const VAULT_ADDRESS = "0x03a859742d854fFe4177601edA79089332bE735F";
const USDC_ADDRESS = "0x7c4aA5bD1DE539FA8ce0797EEb3D3F9C7fA59936";
const JUKU_ADDRESS = "0xCaa16863B23Fd75F7d34134727dF0EEbC6Ea5CF6";
const ADMIN_ADDRESS = "0xF94AeE7BD5bdfc249746edF0C6Fc0F5E3c1DA226";
const ROUTER_SW = "0xa6AD18C2aC47803E193F75c3677b14BF19B94883";
const PAIR = "0x1DCc928E5Be67d93dA77F928cED345C23fC756c7";

async function main() {
  console.log("Deployment start...");
  const routerSw = await ethers.getContractAt(router, ROUTER_SW);
  const juku = await ethers.getContractAt("JUKU_ERC20", JUKU_ADDRESS);
  const usdc = await ethers.getContractAt("Token", USDC_ADDRESS);

  const swap = async () => {
    const usdcAmount = ethers.utils.parseUnits("1000.0", 6);
    const jukuAmount = ethers.utils.parseUnits("10000.0", 18);
    console.log("Start");

    const tx2 = await routerSw.swapExactTokensForTokens(
      jukuAmount,
      0,
      [JUKU_ADDRESS, USDC_ADDRESS],
      ADMIN_ADDRESS,
      MAX_UINT
    );

    await tx2.wait();

    // for (let i = 0; i <= 2; i++) {
    // const tx = await routerSw.swapExactTokensForTokens(
    //   usdcAmount,
    //   0,
    //   [USDC_ADDRESS, JUKU_ADDRESS],
    //   ADMIN_ADDRESS,
    //   MAX_UINT
    // );
    // await tx.wait();

    console.log("Done");
    // }
  };

  for (let i = 0; i <= 100; i++) {
    try {
      await swap();
    } catch (e) {
      console.log(e);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
