# Puppeteer Prerender Sample

SSRやJSでレンダリングしている、レガシーなサイトの表示を高速化するためのサンプル

## Run

```sh
# SSRサーバ起動
$ node --experimental-modules server.mjs
# HTTPサーバ起動
$ docker run -it --rm -d -p 80:80 --name web -v /Volumes/Develop/kght6123/puppeteer-ssr/public:/usr/share/nginx/html nginx
$ docker stop web # 停止
$ docker inspect web # 状況確認

# No SSR http://localhost/index.html
# With SSR http://localhost:58080/
```

## Warning

すでにNginxが起動している場合は止めておく

```sh
# プロセスを確認
$ ps -ef | grep nginx | grep -v grep
# 停止
$ sudo nginx -s stop
# 起動
$ sudo nginx
```
