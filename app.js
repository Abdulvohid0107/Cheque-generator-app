const express = require('express');
const bodyParser = require('body-parser');
const csv = require('csv-parser');
const { Readable } = require('stream');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3009;

// Product prices in soums
const products = {
    "Apple": 5000,
    "Banana": 7500,
    "Orange": 6000,
    "Milk": 25000,
    "Bread": 12500,
    "Eggs": 30000,
    "Cheese": 45000,
    "Chicken": 50000,
    "Rice": 20000,
    "Pasta": 15000
};

// Middleware to serve static files (HTML, CSS, JS)
app.use(express.static('public'));
app.use(bodyParser.json());

function calculateSale(totalAmount, regionProducts, numCheques) {
    const saleItems = [];
    let remainingAmount = totalAmount;
    const targetChequeAmount = totalAmount / numCheques;

    for (let i = 0; i < numCheques; i++) {
        let chequeItems = {};
        let chequeTotal = 0;
        let attempts = 0;

        while (Math.abs(chequeTotal - targetChequeAmount) > 20000 && attempts < 100) {
            chequeItems = {};
            chequeTotal = 0;
            const numProducts = Math.floor(Math.random() * 3) + 1; // 1 to 3 products per cheque

            for (let j = 0; j < numProducts; j++) {
                if (Object.keys(regionProducts).length === 0 || remainingAmount <= 0) break;

                const product = Object.keys(regionProducts)[Math.floor(Math.random() * Object.keys(regionProducts).length)];
                const price = regionProducts[product];

                if (price <= remainingAmount) {
                    let quantity = Math.floor(Math.random() * 5) + 1;
                    let productTotal = price * quantity;

                    if (chequeTotal + productTotal > targetChequeAmount + 20000) {
                        quantity = Math.max(1, Math.floor((targetChequeAmount + 20000 - chequeTotal) / price));
                        productTotal = price * quantity;
                    }

                    chequeItems[product] = quantity;
                    chequeTotal += productTotal;
                }
            }

            attempts++;
        }

        if (Object.keys(chequeItems).length > 0) {
            saleItems.push(chequeItems);
            remainingAmount -= chequeTotal;
        }
    }

    // Distribute remaining amount
    if (remainingAmount > 0) {
        for (const cheque of saleItems) {
            for (const product in cheque) {
                const price = regionProducts[product];
                while (remainingAmount >= price) {
                    cheque[product]++;
                    remainingAmount -= price;
                }
                if (remainingAmount <= 0) break;
            }
            if (remainingAmount <= 0) break;
        }
    }

    return saleItems;
}

// Convert CSV data to JSON
function csvToJson(csvData) {
    return new Promise((resolve, reject) => {
        const results = [];
        const stream = Readable.from(csvData);
        stream
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

// Handle form submission with CSV data and generate Excel file
app.post('/calculate', async (req, res) => {
    const { csvData, chequesInput } = req.body;

    try {
        // Convert CSV data to JSON
        const regions = await csvToJson(csvData);
        const chequesList = chequesInput.split(',').map(x => x.trim());

        const regionSales = [];
        const excelData = [];

        // Process each region and prepare data for Excel
        regions.forEach((regionData, i) => {
            const region = regionData['Region'];
            const totalSale = parseFloat(regionData['TotalSale']);
            const numCheques = parseInt(chequesList[i]);

            const saleResult = calculateSale(totalSale, products, numCheques);
            regionSales.push({ region, totalSale, saleResult });

            saleResult.forEach((chequeItems, chequeNumber) => {
                Object.keys(chequeItems).forEach((product) => {
                    const quantity = chequeItems[product];
                    const price = products[product];
                    const totalPrice = price * quantity;

                    excelData.push({
                        Region: region,
                        Cheque: chequeNumber + 1,
                        Product: product,
                        Quantity: quantity,
                        PricePerUnit: price,
                        TotalPrice: totalPrice
                    });
                });
            });
        });

        // Generate the Excel file
        const filePath = path.join(__dirname, 'region_sales_output.xlsx');
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(excelData);
        xlsx.utils.book_append_sheet(wb, ws, 'Sales Data');
        xlsx.writeFile(wb, filePath);

        console.log(`File created at ${filePath}`);

        // Send the file for download
        res.download(filePath, (err) => {
            if (err) {
                console.error('Error sending the file', err);
                res.status(500).send('Error generating the Excel file');
            }
            // Optionally delete the file after download
            fs.unlinkSync(filePath);
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error processing the CSV file.');
    }
});

// Start server
app.listen(port, () => {
    console.log(`App running at http://localhost:${port}`);
});
