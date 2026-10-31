# B7 Intelligence

**Purpose:** machine learning, AI applications, data processing and scientific computing. This profile does not depend on the web stack.

## Configuration

Intelligence choices live here rather than in the shared [configuration model](../../docs/configuration-model.md). The shared dimensions that apply are `language = python`, `database`, `infrastructure.target = docker`, `testing = pytest`, and `backendStrategy` (`none` for training and research, `standalone` for an inference service).

| Concern | Default | Options |
|---------|---------|---------|
| Language | Python | — |
| Environment | `uv` with a lockfile | pip-tools |
| Deep learning | PyTorch | — |
| Classical ML | scikit-learn | — |
| Models and datasets | Hugging Face (`transformers`, `datasets`) | — |
| Inference serving | ONNX Runtime for exported models | Native PyTorch, when a model cannot be exported |
| Service layer | none | A small HTTP service (for example FastAPI), when the model must be served |
| Testing | pytest | — |
| Deploy | Docker (CPU or GPU base image) | — |

## Integration with other profiles

- The boundary is **HTTP or a model artifact**, never a shared codebase.
- Export to ONNX to run inference inside a [B7 API](../api/README.md) service, using an ONNX Runtime binding for that language. Check that ONNX Runtime supports the target platform first. Cloudflare Workers is **not** a supported target for ONNX Runtime models in B7.
- Hugging Face model licenses vary. Check each model's license before using it commercially.

## Conventions

- `data/` stays out of git. Track datasets by version or hash.
- Fix random seeds and record the environment lockfile with each training run.
- Notebooks are for exploration. Code that ships lives in a package with tests.
