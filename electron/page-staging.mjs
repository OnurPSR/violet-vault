import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, rmdir, stat } from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic"]);

function noteName(notePath) {
  if (typeof notePath !== "string" || !notePath.toLowerCase().endsWith(".md")) {
    throw new Error("Select the target note before sending handwritten pages.");
  }
  return path.basename(notePath, path.extname(notePath));
}

function nextPageNumber(filenames) {
  return filenames.reduce((maximum, filename) => {
    const match = /^page-(\d+)\.[^.]+$/i.exec(filename);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0) + 1;
}

export async function saveUploadedPages({ vaultPath, notePath, images, maxImages = 12, maxImageBytes = 40 * 1024 * 1024 }) {
  if (!Array.isArray(images) || images.length === 0) return [];

  const vaultRoot = path.resolve(vaultPath);
  const relativeDirectory = path.posix.join("attachments", noteName(notePath), "notes");
  const destinationDirectory = path.resolve(vaultRoot, ...relativeDirectory.split("/"));
  const relative = path.relative(vaultRoot, destinationDirectory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("The page attachment directory is outside the selected vault.");

  await mkdir(destinationDirectory, { recursive: true });
  const firstPage = nextPageNumber(await readdir(destinationDirectory));
  const copied = [];

  try {
    for (const image of images.slice(0, maxImages)) {
      if (!image || typeof image.path !== "string") continue;
      const extension = path.extname(image.path).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) continue;
      const metadata = await stat(image.path);
      if (!metadata.isFile()) continue;
      if (metadata.size > maxImageBytes) throw new Error(`${path.basename(image.path)} exceeds the 40 MB image limit.`);

      const pageNumber = firstPage + copied.length;
      const filename = `page-${pageNumber}${extension}`;
      const absolutePath = path.join(destinationDirectory, filename);
      await copyFile(image.path, absolutePath, fsConstants.COPYFILE_EXCL);
      copied.push({ absolutePath, vaultPath: path.posix.join(relativeDirectory, filename) });
    }
    return copied;
  } catch (error) {
    await Promise.all(copied.map((page) => rm(page.absolutePath, { force: true })));
    throw error;
  }
}

export async function cleanupUnreferencedUploadedPages({ vaultPath, notePath, pages }) {
  if (!Array.isArray(pages) || pages.length === 0) return { removed: [], retained: [] };
  let noteContent = "";
  try {
    noteContent = await readFile(path.resolve(vaultPath, notePath), "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const removed = [];
  const retained = [];
  for (const page of pages) {
    if (noteContent.includes(page.vaultPath) || noteContent.includes(page.vaultPath.replaceAll(" ", "%20"))) {
      retained.push(page.vaultPath);
      continue;
    }
    await rm(page.absolutePath, { force: true });
    removed.push(page.vaultPath);
  }

  const directories = [...new Set(pages.map((page) => path.dirname(page.absolutePath)))];
  for (const directory of directories) {
    try {
      await rmdir(directory);
    } catch (error) {
      if (!["ENOTEMPTY", "ENOENT"].includes(error?.code)) throw error;
    }
  }
  return { removed, retained };
}
