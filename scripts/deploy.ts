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
  NETWOR_BUNDLE_ADDRESS,
} from "../test/constants";
const USDT_ADDRESS = "0x4e698B155abdE661E31b0561C1a6654D970Bf256";
const CBI_ERC20_ADDRESS = "0x46DeD65e49FC12E37cd98a9B83E660F94AAB3791";
const CRG_ERC20_ADDRESS = "0x93d56Ff2dFA25954696dE21bC01edC6c1F90491f";
const ROUTER_ADDRESS = "0xa6AD18C2aC47803E193F75c3677b14BF19B94883";
const ADMIN_ADDRESS = "0x8A45436cFabd59c305b0A129188117D4C3a4E928";

async function main() {
  console.log("Deployment start...");
  const YO = await ethers.getContractFactory("YieldOptimizer");

  const yo = await YO.deploy(
    "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
    "0x429848605052D62870D3d9138F0F2F9f58695C0b",
    "0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce"
  );

  await yo.deployed();
  const vault = await ethers.getContractAt(vaultAbi, VAULT_ADDRESS);
  const juku7 = await ethers.getContractAt(weightedPoolAbi, JUKU7_POOL_ADDRESS);
  const poolID = await juku7.getPoolId();
  await yo.addPool(poolID, "0xDf02adB3CD587DA89aF29E58DE70b840e4949025", [
    poolID,
    poolID,
    poolID,
    poolID,
    poolID,
    poolID,
    poolID,
  ]);
  console.log("YO address: ", yo.address);

  try {
    await verifyContract(yo.address, [
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
