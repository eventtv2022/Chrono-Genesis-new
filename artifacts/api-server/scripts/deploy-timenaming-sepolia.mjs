import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import solc from "solc";
import { ContractFactory, JsonRpcProvider, Wallet, getAddress } from "ethers";

const apiRoot = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const sourcePath = path.join(apiRoot, "contracts", "TimeNationMinuteNFT.sol");
const treasury = getAddress("0x4a290953E0A4c9374901939D5612AFDAAf99312b");

class SafeDeploymentError extends Error {}

function compileContract() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const input = {
    language: "Solidity",
    sources: { "TimeNationMinuteNFT.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), {
    import(importPath) {
      try {
        return { contents: fs.readFileSync(require.resolve(importPath, { paths: [apiRoot] }), "utf8") };
      } catch {
        return { error: `Unable to resolve Solidity import: ${importPath}` };
      }
    },
  }));
  const errors = (output.errors ?? []).filter(item => item.severity === "error");
  if (errors.length) throw new Error(errors.map(item => item.formattedMessage).join("\n"));
  const contract = output.contracts?.["TimeNationMinuteNFT.sol"]?.TimeNationMinuteNFT;
  if (!contract?.evm?.bytecode?.object || !contract.abi) {
    throw new Error("Solidity compiler did not return contract bytecode and ABI.");
  }
  return contract;
}

const compiled = compileContract();
if (process.argv.includes("--compile-only")) {
  console.log(JSON.stringify({ status: "compiled", compiler: solc.version(), bytecodeBytes: compiled.evm.bytecode.object.length / 2 }));
  process.exit(0);
}

const rpcUrl = process.env.SEPOLIA_RPC_URL;
const privateKey = process.env.SEPOLIA_RELAYER_PRIVATE_KEY;
if (!rpcUrl || !privateKey) {
  throw new SafeDeploymentError("Set SEPOLIA_RPC_URL and SEPOLIA_RELAYER_PRIVATE_KEY in Replit Secrets.");
}

const trimmedKey = privateKey.trim();
const normalizedPrivateKey = trimmedKey.startsWith("0x") ? trimmedKey : `0x${trimmedKey}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedPrivateKey)) {
  throw new SafeDeploymentError("SEPOLIA_RELAYER_PRIVATE_KEY must be a 32-byte hexadecimal private key.");
}

const provider = new JsonRpcProvider(rpcUrl, 11155111);
try {
  let network;
  try {
    network = await provider.getNetwork();
  } catch {
    throw new SafeDeploymentError("Could not connect to the configured Sepolia RPC endpoint.");
  }
  if (network.chainId !== 11155111n) throw new SafeDeploymentError(`RPC connected to unexpected chain ID ${network.chainId}.`);

  let signer;
  try {
    signer = new Wallet(normalizedPrivateKey, provider);
  } catch {
    throw new SafeDeploymentError("SEPOLIA_RELAYER_PRIVATE_KEY is not a valid secp256k1 private key.");
  }
  let balance;
  try {
    balance = await provider.getBalance(signer.address);
  } catch {
    throw new SafeDeploymentError("Could not read the Sepolia deployer balance from the configured RPC endpoint.");
  }
  console.log(JSON.stringify({
    mode: process.argv.includes("--deploy") ? "deploy" : "dry-run",
    chainId: Number(network.chainId),
    deployer: signer.address,
    treasury,
    testEthBalance: (Number(balance) / 1e18).toFixed(6),
  }));

  if (!process.argv.includes("--deploy")) {
    console.log("Dry run only. Pass --deploy to broadcast the Sepolia deployment transaction.");
  } else {
    const factory = new ContractFactory(compiled.abi, `0x${compiled.evm.bytecode.object}`, signer);
    let contract;
    let receipt;
    let contractAddress;
    let transaction;
    try {
      contract = await factory.deploy(treasury);
      await contract.waitForDeployment();
      contractAddress = await contract.getAddress();
      transaction = contract.deploymentTransaction();
      receipt = await transaction?.wait(1);
    } catch {
      throw new SafeDeploymentError("Sepolia deployment failed; provider and signer details were suppressed.");
    }

    const [owner, deployedTreasury, royalty] = await Promise.all([
      contract.getFunction("owner")(),
      contract.getFunction("treasuryWallet")(),
      contract.getFunction("royaltyInfo")(1n, 10_000n),
    ]);
    if (getAddress(owner) !== getAddress(signer.address) || getAddress(deployedTreasury) !== treasury || royalty[1] !== 200n) {
      throw new SafeDeploymentError(`Deployment completed at ${contractAddress}, but on-chain ownership or royalty verification failed.`);
    }

    console.log(JSON.stringify({
      status: "deployed",
      chainId: Number(network.chainId),
      contractAddress,
      owner: signer.address,
      treasury: deployedTreasury,
      royaltyBps: 200,
      transactionHash: receipt?.hash ?? transaction?.hash,
      blockNumber: receipt?.blockNumber,
      explorerUrl: `https://sepolia.etherscan.io/address/${contractAddress}`,
    }));
  }
} catch (error) {
  if (error instanceof SafeDeploymentError) {
    console.error(error.message);
  } else {
    console.error("Sepolia operation failed. Provider and signer details were suppressed to protect secrets.");
  }
  process.exitCode = 1;
} finally {
  await provider.destroy();
}
