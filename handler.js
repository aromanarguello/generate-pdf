"use strict";

const { puppeteer, args, defaultViewport, executablePath } = require("chrome-aws-lambda");
const { S3 } = require("aws-sdk");
const fs = require("fs");
const { invoiceTemplate } = require("./invoiceTemplate");

const s3 = new S3();

module.exports.handler = async ({ data }, ctx, cb) => {
  ctx.callbackWaitsForEmptyEventLoop = false;
  let result = null;
  let browser = null;

  const date = new Date().toISOString();

  const filename = `invoice-${data.invoice_id}-${date}`;

  const pdfPath = `/tmp/${filename}.pdf`;

  try {
    console.log("Establishing connection...");

    browser = await puppeteer.launch({
      args,
      defaultViewport,
      executablePath: await executablePath,
      headless: true,
      ignoreHTTPSErrors: true,
    });

    console.log("Opening new page...");
    const page = await browser.newPage();

    console.log("Generating PDF file from HTML template...");

    await page.setContent(invoiceTemplate({ ...data }), { waitUntil: "networkidle2" });

    await page.pdf({ format: "Letter", path: pdfPath });

    const params = {
      Key: pdfPath,
      Body: fs.createReadStream(pdfPath),
      Bucket: "pdf-dev-serverlessdeploymentbucket-1wo8vtkxrcorr",
      ContentType: "application/pdf",
    };

    console.log("Uploading PDF...");

    await s3
      .upload(params, async (err, res) => {
        if (err) {
          console.log(err);
          throw new Error(err);
        }
        console.log("done");
        console.log(res);
        return cb(null, res);
      })
      .promise();

    result = await page.title();
  } catch (error) {
    return cb(error);
  } finally {
    if (browser !== null) {
      console.log("Closing browser...");
      await browser.close();
    }
  }
  return cb(null, result);
};
