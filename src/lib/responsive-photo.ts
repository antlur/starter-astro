import { getImage } from "astro:assets";

export async function responsivePhoto(src: string, dimensions: { width: number; height: number } | null, sizes: string):
  Promise<{ src?: string; srcset?: string; sizes?: string }> {
  if (!dimensions || !/^https:\/\/cdn\.bckstg\.app\/media\/[^?#]+\.(?:jpe?g|png|webp|avif)$/i.test(src)) return {};

  const width = Math.min(dimensions.width, 1600);
  const height = Math.max(1, Math.round(dimensions.height * width / dimensions.width));
  const widths = [480, 800, 1200].filter((candidate) => candidate < width);
  if (widths.length === 0) return {};
  const image = await getImage({ src, width, height, widths: [...widths, width], sizes, format: "webp" });
  return { src: image.src, srcset: image.srcSet.attribute, sizes };
}
