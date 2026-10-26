// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Sepolia ERC-721 receipts for reserved TimeNation timeline minutes.
/// Token IDs are Unix-minute timestamps (not second timestamps).
contract TimeNationMinuteNFT is ERC721URIStorage, ERC2981, Ownable {
    uint96 public constant ROYALTY_BPS = 200;
    address public immutable treasuryWallet;
    mapping(uint256 => bool) public isMinuteMinted;

    error InvalidTreasury();
    error InvalidRecipient();
    error MinuteAlreadyMinted();

    constructor(address treasury)
        ERC721("TimeNation Minute License", "TN-MIN")
        Ownable(msg.sender)
    {
        if (treasury == address(0)) revert InvalidTreasury();
        treasuryWallet = treasury;
        _setDefaultRoyalty(treasury, ROYALTY_BPS);
    }

    function mintMinute(address to, uint256 minuteTimestamp, string calldata uri)
        external
        onlyOwner
    {
        if (to == address(0)) revert InvalidRecipient();
        if (isMinuteMinted[minuteTimestamp]) revert MinuteAlreadyMinted();
        isMinuteMinted[minuteTimestamp] = true;
        _safeMint(to, minuteTimestamp);
        _setTokenURI(minuteTimestamp, uri);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
