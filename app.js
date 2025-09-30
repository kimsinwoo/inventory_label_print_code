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

// --- PDF 생성 함수 ---
async function generateLabelPDF({ productName, manufactureDate, expiryDate, barcode, labelSize }) {
  // 바코드 크기 설정
  let barcodeHeight = 40;
  let barcodeScale = 2;
  if(labelSize === "large") { barcodeHeight = 15; barcodeScale = 1.5; }
  else if(labelSize === "medium") { barcodeHeight = 15; barcodeScale = 1.3; }
  else if(labelSize === "small") { barcodeHeight = 15; barcodeScale = 1; }

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

  // PDF 생성
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
  return pdfPath;
}

// --- 1. 웹에서 PDF 미리보기 ---
app.post("/preview-label", async (req, res) => {
  const { productName, manufactureDate, expiryDate, barcode, labelSize } = req.body;
  if (!productName || !manufactureDate || !expiryDate || !barcode || !labelSize) {
    return res.status(400).send("필드 누락");
  }

  try {
    const pdfPath = await generateLabelPDF({ productName, manufactureDate, expiryDate, barcode, labelSize });
    
    // PDF를 브라우저에서 바로 보여주기
    res.sendFile(pdfPath, {}, (err) => {
      fs.unlinkSync(pdfPath); // 전송 후 임시 파일 삭제
      if(err) console.error(err);
    });
  } catch(err) {
    console.error(err);
    res.status(500).send("라벨 미리보기 중 오류 발생: " + err.message);
  }
});

// --- 2. 프린트 ---
app.post("/print-label", async (req, res) => {
  const { productName, manufactureDate, expiryDate, barcode, labelSize, printerName } = req.body;
  if (!productName || !manufactureDate || !expiryDate || !barcode || !labelSize || !printerName) {
    return res.status(400).send("필드 누락");
  }

  try {
    const pdfPath = await generateLabelPDF({ productName, manufactureDate, expiryDate, barcode, labelSize });
    
    await ptp.print(pdfPath, { printer: printerName, copies: 1 });
    fs.unlinkSync(pdfPath);

    res.send("라벨이 프린터로 출력되었습니다!");
  } catch(err) {
    console.error(err);
    res.status(500).send("라벨 출력 중 오류 발생: " + err.message);
  }
});

app.listen(3000, () => {
  console.log("서버 실행중: http://localhost:3000");
});
