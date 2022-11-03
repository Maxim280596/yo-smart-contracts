import { ethers } from "hardhat";
import { verifyContract } from "./verify";
import { vaultAbi } from "../test/abis/vaultAbi";
import { weightedPoolAbi } from "../test/abis/weightedPoolAbi";
import {
  VAULT_ADDRESS,
  JUKU7_POOL_ADDRESS,
  MAX_UINT,
  ONE_DAY,
  address,
  nowInSeconds,
  NETWORK_BUNDLE_ADDRESS,
  NETWORK_POOL_ID,
  USDC_FTM_POOL_ADDRESS,
  USDC_FTM_POOL_ID,
  JUKU_POOL_ID,
  WFTM_ADDRESS,
} from "../test/constants";

async function main() {
  console.log("Deployment start...");
  // const YO = await ethers.getContractFactory("YieldOptimizer");
  const YO = await ethers.getContractAt(
    "YieldOptimizer",
    "0x8aE732E8e2F036AF3c1bBe3E96C20A21a87dFd2B"
  );

  // const yo = await YO.deploy(
  //   "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
  //   "0x429848605052D62870D3d9138F0F2F9f58695C0b",
  //   "0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce"
  // );

  // await yo.deployed();
  const vault = await ethers.getContractAt(vaultAbi, VAULT_ADDRESS);
  const juku7 = await ethers.getContractAt(weightedPoolAbi, JUKU7_POOL_ADDRESS);

  // await yo.addPool(
  //   JUKU_POOL_ID,
  //   JUKU7_POOL_ADDRESS,
  //   "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
  //   "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
  //   JUKU_POOL_ID,
  //   JUKU_POOL_ID,
  //   [
  //     JUKU_POOL_ID,
  //     JUKU_POOL_ID,
  //     JUKU_POOL_ID,
  //     JUKU_POOL_ID,
  //     JUKU_POOL_ID,
  //     JUKU_POOL_ID,
  //     JUKU_POOL_ID,
  //   ],
  //   0,
  //   true,
  //   true
  // );

  await YO.addPool(
    NETWORK_POOL_ID,
    NETWORK_BUNDLE_ADDRESS,
    WFTM_ADDRESS,
    WFTM_ADDRESS,
    USDC_FTM_POOL_ID,
    USDC_FTM_POOL_ID,
    [NETWORK_POOL_ID, NETWORK_POOL_ID, NETWORK_POOL_ID, NETWORK_POOL_ID],
    0,
    true,
    true
  );

  // console.log("YO address: ", yo.address);

  try {
    await verifyContract("0x8aE732E8e2F036AF3c1bBe3E96C20A21a87dFd2B", [
      "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
      "0x429848605052D62870D3d9138F0F2F9f58695C0b",
      "0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce",
    ]);
  } catch (err) {
    console.log("TokenSale verify", err);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
