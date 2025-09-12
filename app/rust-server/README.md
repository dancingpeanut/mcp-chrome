## Build

- build exetension
```
cd mcp-chrome
# node版本20+
pnpm run build

# 进入app/chrome-extension, build插件，可能提示缺失资源文件，多试几次即可
cd app/chrome-extension
pnpm run build
```

- build server
```
cd app/rust-server
cargo run --release
```

