import { ethers, upgrades } from "hardhat";
import { verifyContract } from "./verify";

const PROXY_INSTANCE = "0x4d93c0b000687698eb64286Ba18D1E9E57F6F1e3";

async function main() {
  console.log("Upgrade start...");
  const YO_STAKING = await ethers.getContractFactory("YieldOptimizerStaking");
  const yo_staking = await upgrades.upgradeProxy(PROXY_INSTANCE, YO_STAKING);

  await yo_staking.deployed();

  try {
    await verifyContract(yo_staking.address, []);
  } catch (err) {
    console.log("YO_STAKING verify", err);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
