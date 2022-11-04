import { ethers } from "hardhat";
import { verifyContract } from "./verify";
import {
  VAULT_ADDRESS,
  JUKU7_POOL_ADDRESS,
  NETWORK_BUNDLE_ADDRESS,
  NETWORK_POOL_ID,
  USDC_FTM_POOL_ID,
  JUKU_POOL_ID,
  WFTM_ADDRESS,
  USDC_ADDRESS,
  ADMIN_ADDRESS,
} from "../test/constants";

async function main() {
  console.log("Deployment start...");
  const YO = await ethers.getContractFactory("YieldOptimizer");
  const yo = await YO.deploy(USDC_ADDRESS, ADMIN_ADDRESS, VAULT_ADDRESS);

  await yo.deployed();
  console.log(`YO deployed to address:`, yo.address);
  console.log("start adding JUKU7...");
  await yo.addPool(
    JUKU_POOL_ID,
    JUKU7_POOL_ADDRESS,
    USDC_ADDRESS,
    USDC_ADDRESS,
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
  console.log("JUKU7 is added to YO!");
  console.log("start adding Network Bundle...");
  await yo.addPool(
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
  console.log("Network bundle is added to YO!");

  try {
    await verifyContract(yo.address, [
      USDC_ADDRESS,
      ADMIN_ADDRESS,
      VAULT_ADDRESS,
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
