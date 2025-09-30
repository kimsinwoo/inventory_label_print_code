import express from "express";
import puppeteer from "puppeteer";
import bwipjs from "bwip-js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import ptp from "pdf-to-printer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// EJS 설정
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// 라벨 PDF 생성 + 프린트 API
app.post("/print-label", async (req, res) => {
  const { productName, manufactureDate, expiryDate, barcode, labelSize, printerName } = req.body;

  if (!productName || !manufactureDate || !expiryDate || !barcode || !labelSize || !printerName) {
    return res.status(400).send("필드 누락");
  }

  try {
    // 바코드 크기 설정
    let barcodeHeight = 40;
    let barcodeScale = 2;
    if(labelSize === "large") { barcodeHeight = 30; barcodeScale = 1.5; }
    else if(labelSize === "medium") { barcodeHeight = 15; barcodeScale = 1.3; }
    else if(labelSize === "small") { barcodeHeight = 10; barcodeScale = 1; }

    // 바코드 생성
    const pngBuffer = await bwipjs.toBuffer({
      bcid: "code128",
      text: barcode,
      scale: barcodeScale,
      height: barcodeHeight,
      includetext: true,
      textxalign: "center",
    });
    const barcodeBase64 = pngBuffer.toString("base64");

    // HTML 렌더링
    const html = await new Promise((resolve, reject) => {
      app.render("label", { productName, manufactureDate, expiryDate, barcode, barcodeBase64, labelSize }, (err, renderedHtml) => {
        if(err) reject(err);
        else resolve(renderedHtml);
      });
    });

    // Puppeteer로 PDF 생성
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfPath = path.join(__dirname, `temp_label_${Date.now()}.pdf`);
    await page.pdf({
      path: pdfPath,
      printBackground: true,
      width: labelSize === 'large' ? '100mm' : labelSize === 'medium' ? '80mm' : '40mm',
      height: labelSize === 'large' ? '100mm' : labelSize === 'medium' ? '60mm' : '20mm',
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    await browser.close();

    // PDF 프린트
    await ptp.print(pdfPath, { printer: printerName, copies: 1 });

    // 임시 PDF 삭제
    fs.unlinkSync(pdfPath);

    res.send("라벨이 프린터로 출력되었습니다!");

  } catch (err) {
    console.error(err);
    res.status(500).send("라벨 생성 또는 출력 중 오류 발생: " + err.message);
  }
});

app.listen(3000, () => {
  console.log("서버 실행중: http://localhost:3000");
});
