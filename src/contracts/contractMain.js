
import { BrowserProvider, Contract, JsonRpcProvider } from 'ethers';
import contractABI from '../abis/contractMain.json';

export const contractMainAddress = '0x83412BEefFa2e2C5AF5C9003dde68d088144d744';
export const RPC = 'http://127.0.0.1:8545';

export const getContractMain = () => {
  const provider = new JsonRpcProvider(RPC);
  return new Contract(contractMainAddress, contractABI.abi, provider); // Burada .abi ekledik
};

export const getSignerContractMain = async () => {
  if (typeof window !== 'undefined' && typeof window.ethereum !== 'undefined') {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new Contract(contractMainAddress, contractABI.abi, signer); // Burada da .abi ekledik
  } else {
    throw new Error('Ethereum wallet is not installed');
  }
};


export default getContractMain;