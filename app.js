
let lens;
let signer;

// Function to get the value of a URL parameter
function getQueryParam(param) {
    const queryParams = new URLSearchParams(window.location.search);
    return queryParams.get(param);
}

// Function to convert a decimal chain ID to a hexadecimal format
function toHexChainId(chainId) {
    return '0x' + parseInt(chainId).toString(16);
}

// Function to switch MetaMask to a specified chain
async function switchChain(chainId) {
    try {
        await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: toHexChainId(chainId) }],
        });
    } catch (switchError) {
        if (switchError.code === 4902) {
            const errorMessage = 'No network added to MetaMask, add network first.';
            const chainListUrl = `https://chainlist.org/chain/${parseInt(chainId)}`;
            const errorDiv = document.getElementById('errorMessage');

            // Update the error message display
            errorDiv.innerHTML = `${errorMessage} <a href="${chainListUrl}" target="_blank">Add Network</a>`;
        } else {
            console.error(switchError);
        }
    }
}

function populateCollateralDropdown(positions) {
    const borrowedDropdown = document.getElementById('borrowedDropdown');
    borrowedDropdown.innerHTML = ''; // Clear existing options


    const collateralDropdown = document.getElementById('collateralDropdown');
    collateralDropdown.innerHTML = ''; // Clear existing options


    let collateralsUsed = {}
    let borrowedUsed = {}

    positions.forEach(position => {

        if (!borrowedUsed[position.borrowedInfo.ctoken]) {
            const option = document.createElement('option');
            option.value = position.borrowedInfo.ctoken;
            option.textContent = position.borrowedInfo.underlyingSymbol  + ` (decimals ${position.borrowedInfo.underlyingDecimals}, position ${position.borrowBalance})`;

            console.log(position)
            option.setAttribute('data-position', JSON.stringify(position));
            option.setAttribute('data-borrowBalance', position.borrowBalance);
            option.setAttribute('data-borrowedUnderlyingAddress', position.borrowedInfo.underlying);

            borrowedDropdown.appendChild(option);

            if (Object.keys(borrowedUsed).length === 0) {
               document.getElementById('borrowedValue').value = position.borrowBalance;
            }
            borrowedUsed[position.borrowedInfo.ctoken] = true;
        }

        if (!collateralsUsed[position.collateralInfo.ctoken]) {
            const option = document.createElement('option');
            option.value = position.collateralInfo.ctoken;
            option.textContent = position.collateralInfo.ctokenSymbol;

            collateralDropdown.appendChild(option);

            collateralsUsed[position.collateralInfo.ctoken] = true;
        }

    });

    // Show the liquidation form now that it's populated
    document.getElementById('liquidationForm').style.display = 'block';
    onChange()
}


// Function to handle the Ethereum logic
async function handleEthereum(ownerAddr, unitrollerAddr) {
    if (typeof window.ethereum !== 'undefined') {
        try {
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();
            console.log("Connected Account:", await signer.getAddress());

            // Hide the Connect Wallet button after successful connection
            document.getElementById('connectWallet').style.display = 'none';

             const comptroller = new ethers.Contract(unitrollerAddr, ComptrollerABI, signer);
             const markers = await comptroller.getAllMarkets()
            console.log(markers)

            // Get the lens contract address from URL parameters
            const lensAddress = getQueryParam('lens');
                // Initialize the contract
            lens = new ethers.Contract(lensAddress, LensMiniABI, signer);
            const res =  await lens.isLiquidationAllowed([], [], [[ownerAddr, markers]], markers.length*markers.length);
            console.log(res)

            populateCollateralDropdown(res.result.slice(0, res.resultCount));
        } catch (error) {
            console.error(error);
        }
    } else {
        console.log('Ethereum object not found, install MetaMask.');
    }
}

document.getElementById('connectWallet').addEventListener('click', async () => {
    // Get the Ethereum addresses and chainId from URL parameters
    const owner = getQueryParam('owner');
    const unitroller = getQueryParam('unitroller');
    const chainId = getQueryParam('chainid');

    console.log('Owner Address:', owner);
    console.log('Unitroller Address:', unitroller);
    console.log('Chain ID:', chainId);

    // Switch MetaMask to the specified chain
    if (chainId) {
        await switchChain(chainId);
    }

    // Proceed with Ethereum logic
    await handleEthereum(owner, unitroller);
});




async function onChange() {
    const borrowedValue = document.getElementById('borrowedValue').value;
    const selectedCollateral = document.getElementById('collateralDropdown').value;
    const selectedBorrowed = document.getElementById('borrowedDropdown').value;

    // Prepare parameters for isLiquidationAllowedForAmount
    // Assuming you have pricesCTokens, prices, account, borrowed, collateral from somewhere
    // ...


    try {
        console.log(getQueryParam('owner'), selectedBorrowed, selectedCollateral, borrowedValue)
        const allowed = await lens.isLiquidationAllowedForAmount(
            [], [], getQueryParam('owner'), selectedBorrowed, selectedCollateral, borrowedValue
        );
        console.log(allowed)

        if (!allowed) {
            document.getElementById('liquidationError').textContent = 'Liquidation not allowed for this value.';
        } else {
            document.getElementById('liquidationError').textContent = '';
        }
    } catch (error) {
        console.error(error);
        // Handle error
    }
}
document.getElementById('borrowedValue').addEventListener('input', onChange);
document.getElementById('collateralDropdown').addEventListener('change', onChange);
document.getElementById('borrowedDropdown').addEventListener('change', function() {
    const selectedOption = this.options[this.selectedIndex];
    const borrowBalance = selectedOption.getAttribute('data-borrowBalance');
    // Now collateralObj is your original JavaScript object

   document.getElementById('borrowedValue').value = borrowBalance;

   onChange()
});


document.getElementById('liquidateButton').addEventListener('click', async () => {
    let borrowedSelected = document.getElementById('borrowedDropdown').options[document.getElementById('borrowedDropdown').selectedIndex];
    const borrowed = borrowedSelected.value;
    const collateral = document.getElementById('collateralDropdown').options[document.getElementById('collateralDropdown').selectedIndex].value;
    const borrowedValue = document.getElementById('borrowedValue').value;
    const borrowedUnderlying = borrowedSelected.getAttribute('data-borrowedUnderlyingAddress');
    const isEth = '0x0000000000000000000000000000000000000000' == borrowedUnderlying;
    console.log(borrowed, collateral, borrowedValue, isEth)


    if (isEth) {
         const cether = new ethers.Contract(borrowed, CEtherLiquidation, signer);
         await cether.liquidateBorrow(getQueryParam('owner'), collateral, {value:borrowedValue });
    } else {
         const token = new ethers.Contract(borrowedUnderlying, ERC20, signer);
         await token.approve(borrowed, borrowedValue)

         const cether = new ethers.Contract(borrowed, CTokenLiquidation, signer);
         await cether.liquidateBorrow(getQueryParam('owner'), borrowedValue, collateral);
    }
});