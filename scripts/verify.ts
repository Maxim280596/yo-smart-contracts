import hardhat from "hardhat";
export async function verifyContract(address: any, constructorArguments: any) {
  return hardhat.run("verify:verify", {
    address,
    constructorArguments,
  });
}
