import { vaultAbi } from "./../test/abis/vaultAbi";
import { MAX_INT, MAX_UINT } from "./../test/constants";
import { router } from "./../test/abis/router";
import { ethers, upgrades } from "hardhat";
import { verifyContract } from "./verify";
import { BigNumberish } from "ethers";

const VAULT_ADDRESS = "0x03a859742d854fFe4177601edA79089332bE735F";

const USDC_ADDRESS = "0x7c4aA5bD1DE539FA8ce0797EEb3D3F9C7fA59936";
const BUSD_ADDRESS = "0xab9901d649c517Aa95AA7FAD01B14dB20e533AAd";
const FUSDT_ADDRESS = "0xd8B892fb3EA2098638cEAB2afdf6fC17f85Bbd16";
const DAI_ADDRESS = "0xb8A06a41A9F58A26c7cD1F02F0c8A07F02d1ee25";
const POOL_ID =
  "0xc8871b3d300633ad5f372d188bf2c77d60f4f3bb000100000000000000000003";
const ADMIN_ADDRESS = "0xF94AeE7BD5bdfc249746edF0C6Fc0F5E3c1DA226";

async function main() {
  console.log("Deployment start...");
  const usdc = await ethers.getContractAt("Token", USDC_ADDRESS);
  const fusdt = await ethers.getContractAt("Token", FUSDT_ADDRESS);
  const busd = await ethers.getContractAt("Token", BUSD_ADDRESS);
  const dai = await ethers.getContractAt("Token", DAI_ADDRESS);
  const vault = await ethers.getContractAt(vaultAbi, VAULT_ADDRESS);
  const allowanceUSDC = await usdc.allowance(ADMIN_ADDRESS, vault.address);
  const allowanceDAI = await dai.allowance(ADMIN_ADDRESS, vault.address);
  const allowanceBUSD = await busd.allowance(ADMIN_ADDRESS, vault.address);
  const allowanceFUSD = await fusdt.allowance(ADMIN_ADDRESS, vault.address);

  if (allowanceUSDC.toString() == "0") {
    await usdc.approve(vault.address, MAX_UINT);
  }
  if (allowanceBUSD.toString() == "0") {
    await busd.approve(vault.address, MAX_UINT);
  }
  if (allowanceFUSD.toString() == "0") {
    await fusdt.approve(vault.address, MAX_UINT);
  }
  if (allowanceDAI.toString() == "0") {
    await dai.approve(vault.address, MAX_UINT);
  }

  const swap = async (token1: string, token2: string, decimals: number) => {
    const tx = await vault.swap(
      {
        poolId: POOL_ID,
        kind: 0,
        assetIn: token1,
        assetOut: token2,
        amount: ethers.utils.parseUnits("1000.0", decimals),
        userData: "0x",
      },
      {
        sender: ADMIN_ADDRESS,
        fromInternalBalance: false,
        recipient: ADMIN_ADDRESS,
        toInternalBalance: false,
      },
      1,
      MAX_UINT
    );
    await tx.wait();
  };

  for (let i = 0; i <= 10; i++) {
    await swap(USDC_ADDRESS, DAI_ADDRESS, 6);
    console.log("USDC => DAI", i);
  }

  for (let i = 0; i <= 10; i++) {
    await swap(DAI_ADDRESS, USDC_ADDRESS, 18);
    console.log("DAI => USDC", i);
  }

  for (let i = 0; i <= 10; i++) {
    await swap(BUSD_ADDRESS, FUSDT_ADDRESS, 18);
    console.log("BUSD => FUSDT", i);
  }

  for (let i = 0; i <= 10; i++) {
    await swap(FUSDT_ADDRESS, BUSD_ADDRESS, 6);
    console.log("FUSDT => BUSD", i);
  }

  for (let i = 0; i <= 10; i++) {
    await swap(BUSD_ADDRESS, USDC_ADDRESS, 18);
    console.log("BUSD => USDC", i);
  }

  for (let i = 0; i <= 10; i++) {
    await swap(USDC_ADDRESS, BUSD_ADDRESS, 6);
    console.log("USDC => BUSD", i);
  }

  //   const swap = async () => {
  //     const usdcAmount = ethers.utils.parseUnits("10000.0", 6);
  //     const jukuAmount = ethers.utils.parseUnits("100000.0", 18);
  //     console.log("Start");

  //     // for (let i = 0; i <= 2; i++) {
  //     await routerSw.swapExactTokensForTokens(
  //       usdcAmount,
  //       10,
  //       [USDC_ADDRESS, JUKU],
  //       ADMIN_ADDRESS,
  //       MAX_UINT
  //     );
  //     await routerSw.swapExactTokensForTokens(
  //       jukuAmount,
  //       10,
  //       [JUKU, USDC_ADDRESS],
  //       ADMIN_ADDRESS,
  //       MAX_UINT
  //     );

  //     console.log("Done");
  //     // }
  //   };

  //   for (let i = 0; i <= 100; i++) {
  //     await swap();
  //   }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
