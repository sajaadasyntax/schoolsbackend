import fs from "fs";
import path from "path";
import multer from "multer";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./public/uploads";

export function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `receipt_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, uniqueName);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG/PNG images and PDF files are allowed"));
    }
  },
});

export function deleteUploadedFile(filePath: string) {
  const fullPath = path.join(process.cwd(), filePath.replace("/uploads/", `${UPLOAD_DIR}/`));
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}
