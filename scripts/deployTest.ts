import { ethers, upgrades } from "hardhat";
import { verifyContract } from "./verify";

const VAULT_ADDRESS = "0x03a859742d854fFe4177601edA79089332bE735F";
const USDC_ADDRESS = "0x7c4aA5bD1DE539FA8ce0797EEb3D3F9C7fA59936";
const JUKU = "0xCaa16863B23Fd75F7d34134727dF0EEbC6Ea5CF6";
const ADMIN_ADDRESS = "0x8A45436cFabd59c305b0A129188117D4C3a4E928";
const ROUTER = "0xa6AD18C2aC47803E193F75c3677b14BF19B94883";

async function main() {
  console.log("Deployment start...");
  const YO = await ethers.getContractFactory("YieldOptimizer");
  const yo = await upgrades.deployProxy(
    YO,
    [
      USDC_ADDRESS,
      JUKU,
      ADMIN_ADDRESS,
      VAULT_ADDRESS,
      ROUTER,
      2000,
      3750,
      2500,
      3750,
    ],
    { initializer: "initialize", kind: "uups" }
  );
  await yo.deployed();
  console.log(`YO deployed to address:`, yo.address);
  console.log("start adding JUKU7...");
  await yo.addPool(
    "0x2452a5557d551b129156078ea05cff6b785af68e000100000000000000000001",
    "0x2452A5557d551B129156078ea05cff6B785aF68e",
    USDC_ADDRESS,
    USDC_ADDRESS,
    "0x2452a5557d551b129156078ea05cff6b785af68e000100000000000000000001",
    "0x2452a5557d551b129156078ea05cff6b785af68e000100000000000000000001",
    [
      "0x2452a5557d551b129156078ea05cff6b785af68e000100000000000000000001",
      "0x2452a5557d551b129156078ea05cff6b785af68e000100000000000000000001",
      "0x2452a5557d551b129156078ea05cff6b785af68e000100000000000000000001",
      "0x2452a5557d551b129156078ea05cff6b785af68e000100000000000000000001",
      "0x2452a5557d551b129156078ea05cff6b785af68e000100000000000000000001",
      "0x2452a5557d551b129156078ea05cff6b785af68e000100000000000000000001",
      "0x2452a5557d551b129156078ea05cff6b785af68e000100000000000000000001",
    ],
    3,
    false,
    false
  );
  console.log("JUKU7 is added to YO!");
  console.log("start adding Network Bundle...");
  await yo.addPool(
    "0x9d18356017be509b4d9d64fd96eaff7a2f275111000100000000000000000000",
    "0x9d18356017BE509B4d9D64fD96EAFf7A2F275111",
    "0xdfad4885b3e0e013a8e6a0c83058d5370c7da801",
    "0xdfad4885b3e0e013a8e6a0c83058d5370c7da801",
    "0x2452a5557d551b129156078ea05cff6b785af68e000100000000000000000001",
    "0x2452a5557d551b129156078ea05cff6b785af68e000100000000000000000001",
    [
      "0x9d18356017be509b4d9d64fd96eaff7a2f275111000100000000000000000000",
      "0x9d18356017be509b4d9d64fd96eaff7a2f275111000100000000000000000000",
      "0x9d18356017be509b4d9d64fd96eaff7a2f275111000100000000000000000000",
      "0x9d18356017be509b4d9d64fd96eaff7a2f275111000100000000000000000000",
    ],
    3,
    false,
    false
  );
  console.log("Network bundle is added to YO!");

  try {
    await verifyContract(yo.address, []);
  } catch (err) {
    console.log("YO verify", err);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
