# {{ ACTION_NAME }}

> {{ ACTION_DESCRIPTION }}

## Usage

```yaml
- uses: {{ OWNER }}/{{ ACTION_NAME }}@v1{{ ACTION_USAGE }}
```

## Inputs

{{ ACTION_INPUTS_TABLE }}

## Outputs

{{ ACTION_OUTPUTS_TABLE }}

## Development

```sh
yarn lint      # eslint
yarn test      # jest
yarn coverage  # jest with the 80% coverage threshold
```

---

_Scaffolded using [`@allons-y/template-actions`](https://github.com/allonsy-studio/template-actions)._
