#!/usr/bin/env bash
# Downloads the two transformers.js models METAL uses at search time into
# models/ (or $1), from Hugging Face, and checks each file's SHA-256.
#   - Xenova/all-MiniLM-L6-v2       Recall by meaning        (Apache-2.0)
#   - Xenova/clip-vit-base-patch16  Visual Recall, approx.   (MIT)
# Whisper models for transcription are separate: see the README.
set -euo pipefail
DEST="${1:-models}/Xenova"
HF="https://huggingface.co"
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
while read -r sum file; do
  [ -z "$sum" ] && continue
  repo="Xenova/${file%%/*}"; rel="${file#*/}"; out="$DEST/$file"
  if [ -f "$out" ] && [ "$(sha "$out")" = "$sum" ]; then echo "ok      $file"; continue; fi
  mkdir -p "$(dirname "$out")"
  curl -fsSL --retry 3 -o "$out.part" "$HF/$repo/resolve/main/$rel"
  if [ "$(sha "$out.part")" != "$sum" ]; then echo "checksum mismatch: $file" >&2; rm -f "$out.part"; exit 1; fi
  mv "$out.part" "$out"; echo "fetched $file"
done <<'SUMS'
7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7 all-MiniLM-L6-v2/config.json
da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0 all-MiniLM-L6-v2/tokenizer.json
9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3 all-MiniLM-L6-v2/tokenizer_config.json
b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3 all-MiniLM-L6-v2/special_tokens_map.json
afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1 all-MiniLM-L6-v2/onnx/model_quantized.onnx
854ce4599422a24841d34a129de5b28c092f7175db3db4a23ad965c8fda87cf0 clip-vit-base-patch16/config.json
6f638fb9401a6d6296feff533ee7efe657b787c49f954f82f5906b36ef2a1b1f clip-vit-base-patch16/preprocessor_config.json
72ed5c96db5729294468543e4bc75fce14ca63f58e37300290189ba1c1e52b85 clip-vit-base-patch16/tokenizer.json
60ba2912bc6344c94bc16bbdec27fa1209409167b6f2fdf3cfe9e65462ea3967 clip-vit-base-patch16/tokenizer_config.json
c4864a9376a8401918425bed71fc14fc0e81f9b59ec45c1cf96cccb2df508eac clip-vit-base-patch16/special_tokens_map.json
9106b51e6c663a56b99182ec617c2b3d53577b037e7e24a7717eb78048a0c97a clip-vit-base-patch16/onnx/text_model_quantized.onnx
44eece4fe5fe4e0359a88268a327adf758633a1aade3917690b952bef1501f96 clip-vit-base-patch16/onnx/vision_model_quantized.onnx
SUMS
