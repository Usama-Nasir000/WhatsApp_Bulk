const puppeteer = require("puppeteer");
const fs = require("fs");
const csv = require("csv-parser");
const readline = require("readline");
const qrcodeTerminal = require("qrcode-terminal");


async function readContactsFromCSV(filePath) {
  const contacts = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        console.log("Reading contact:", row);
        contacts.push(row)[0];
      })
      .on("end", () => {
        console.log("Finished reading contacts.");
        resolve(contacts);
      })
      .on("error", reject);
  });
}

async function sendMessage(page, phoneNumber, message) {
  await page.goto(
    `https://web.whatsapp.com/send?phone=${phoneNumber}&text=${encodeURIComponent(
      message
      )}`,
      { waitUntil: "networkidle2" }
      );
      await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36')
      
  try {
    const messageInputSelector = 'div[contenteditable="true"]';
    const sendButtonSelector = 'button[data-tab="11"][aria-label="Send"]';

    await page.waitForSelector(messageInputSelector, {
      timeout: 10000,
    });
    console.log(`Sending message to ${phoneNumber}`);

    await page.type(messageInputSelector, message);

    await page.waitForTimeout(1000);

    await page.locator(sendButtonSelector).click();


    await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch (error) {
    console.error(`Error sending message to ${phoneNumber}: ${error.message}` ,error);
    throw error;
  }
}

async function sendMessageWithRetry(
  page,
  phoneNumber,
  message,
  ) {
    maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(
      `Attempting to send message to ${phoneNumber} (Attempt ${attempt})`
    );
    try {
      await sendMessage(page, phoneNumber, message);
      console.log(`Message successfully sent to ${phoneNumber}`);
      return; // Exit the loop if successful
    } catch (error) {
      console.error(`Error sending message to ${phoneNumber}:`, error.message);
      // Add a delay before retrying
      await page.waitForTimeout(5000);
      continue; // Continue with the next attempt
    }
  }
  console.error(
    `Failed to send message to ${phoneNumber} after ${maxRetries} attempts.`
  );
}


async function sendMessagesToCandidates(filePath, message, browser) {
  const page = await browser.newPage();

  const contacts = await readContactsFromCSV(filePath);
  for (const contact of contacts) {
    await sendMessageWithRetry(page, contact.phone, message);
  }

  await browser.close();
}


async function isLoggedIn(page) {
  try {
    await page.waitForSelector('._3WByx .g0rxnol2.g9p5wyxn.i0tg5vk9.aoogvgrq.o2zu3hjb[style*="visibility: visible;"]', { timeout: 30000 });
    return true;
  } catch (error) {
    return false;
  }
}
async function generateAndDisplayQRCode(page) {
  try {

    // Wait for the QR code element to appear
    while (true) {
      try {
        const qrCodeData = await page.evaluate(() => {
          const qrCodeElement = document.querySelector('div[data-ref^="2@"][class^="_19vUU"]');
          return qrCodeElement ? qrCodeElement.getAttribute("data-ref") : null;
        });

        if (qrCodeData) {
          console.log("QR Code Data:", qrCodeData);
          qrcodeTerminal.generate(qrCodeData, { small: true });
          break; // Exit the loop if QR code is found
        }
      } catch (error) {
        console.error("QR code not found yet. Retrying...");
      }

      await page.waitForTimeout(2000); // Wait for a second before retrying
    }
  } catch (error) {
    console.error("Error generating QR code:", error.message);
  }
}

let browser;

async function main() {
  try {
    const userDataDir = "./whatsapp-profile";
    browser = await puppeteer.launch({
      headless: "new",
      // headless: false,
      userDataDir: userDataDir,
    });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36')

    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle0" , timeout: 0 });

    if (await isLoggedIn(page)) {

      await page.waitForTimeout(5000);

      console.log("Login successful!");

      // Proceed with message sending
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      rl.question("Enter the message you want to send: ", async (message) => {
        rl.close();

        try {
          await sendMessagesToCandidates("contacts.csv", message, browser);
          console.log("Messages sent successfully.");
        } catch (error) {
          console.error("Error sending messages:", error.message);
        }

        await browser.close();
      });
    } else {
      await generateAndDisplayQRCode(page);

      console.log("Please scan the QR code using WhatsApp to authenticate.");

      // Continuously check for login status
      while (!(await isLoggedIn(page))) {
        console.log("Waiting for authentication...");
        await page.waitForTimeout(5000);
      }

      console.log("Login successful!");

      // Proceed with message sending after QR code authentication
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      rl.question("Enter the message you want to send: ", async (message) => {
        rl.close();

        try {
          await sendMessagesToCandidates("contacts.csv", message, browser);
          console.log("Messages sent successfully.");
        } catch (error) {
          console.error("Error sending messages:", error.message);
        }

        await browser.close();
      });
    }
  } catch (error) {
    console.error("Error:", error.message);
    await browser.close();
  }
}

main();