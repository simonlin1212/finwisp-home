"""Apply one local request policy to vendored HTTP adapters, without recording secrets."""
import io
import time
import urllib.request
from urllib.parse import urlsplit
import requests

DOMAINS = ('eastmoney.com','gtimg.cn','sinajs.cn','sina.com.cn','sina.cn','10jqka.com.cn','iwencai.com','baidu.com',
 'hexin.cn','swsresearch.com','dfcfw.com','cninfo.com.cn','cls.cn','swindex.com','csindex.com.cn','cnindex.com.cn','szse.cn','sse.com.cn','bse.cn',
 'pbc.gov.cn','stats.gov.cn','yahoo.com','yahoo.net','hyperliquid.xyz','sec.gov','finra.org','cboe.com','treasury.gov','cftc.gov','nasdaq.com')
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'


def checked_url(url):
    parsed=urlsplit(url)
    host=parsed.hostname or ''
    if parsed.scheme not in ('http','https') or parsed.username or parsed.password or parsed.port not in (None,80,443): raise ValueError('DATA_URL_REJECTED')
    if not any(host==d or host.endswith('.'+d) for d in DOMAINS): raise ValueError('DATA_URL_REJECTED')
    return parsed, parsed.scheme+'://'+host+parsed.path


class Guard:
    def __init__(self, contact):
        self.contact=contact; self.sources=[]; self.errors=[]; self.last={}

    def before(self,url):
        parsed,public=checked_url(url)
        if public not in self.sources: self.sources.append(public)
        domain=next(d for d in DOMAINS if parsed.hostname==d or parsed.hostname.endswith('.'+d))
        interval=1.1 if domain=='eastmoney.com' else 0.2
        time.sleep(max(0,interval-(time.monotonic()-self.last.get(domain,0))))
        self.last[domain]=time.monotonic()
        if domain=='sec.gov' and (not self.contact or '@' not in self.contact): raise ValueError('SEC_CONTACT_REQUIRED')
        return domain

    def install(self):
        guard=self; send=requests.Session.send
        def guarded_send(session,request,**kwargs):
            domain=guard.before(request.url)
            request.headers.setdefault('User-Agent',UA)
            if domain=='sec.gov': request.headers['User-Agent']=guard.contact
            kwargs['timeout']=min(kwargs.get('timeout') or 15,15) if isinstance(kwargs.get('timeout'),(int,float,type(None))) else (8,15)
            kwargs['stream']=True
            try:
                response=send(session,request,**kwargs)
                # Yahoo sets its anonymous cookie on the documented fc.yahoo.com 404 bootstrap.
                if not (domain=='yahoo.com' and request.url.rstrip('/')=='https://fc.yahoo.com' and response.status_code==404):
                    response.raise_for_status()
                body=bytearray()
                try:
                    for chunk in response.iter_content(65536):
                        body.extend(chunk)
                        if len(body)>12_000_000: raise ValueError('DATA_RESPONSE_TOO_LARGE')
                    response._content=bytes(body); response._content_consumed=True
                finally: response.close()
                return response
            except requests.RequestException as error:
                status=getattr(getattr(error,'response',None),'status_code',None)
                guard.errors.append({'host':domain,'code':'HTTP_'+str(status) if status else 'NETWORK_ERROR'})
                raise
        requests.Session.send=guarded_send
        class Redirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,req,fp,code,msg,headers,newurl):
                checked_url(newurl)
                return super().redirect_request(req,fp,code,msg,headers,newurl)
        opener=urllib.request.build_opener(Redirect())
        def urlopen(url,data=None,timeout=15,**kwargs):
            request=url if isinstance(url,urllib.request.Request) else urllib.request.Request(url,data=data)
            domain=guard.before(request.full_url)
            request.add_header('User-Agent',guard.contact if domain=='sec.gov' else UA)
            try:
                with opener.open(request,timeout=min(timeout or 15,15)) as response:
                    body=response.read(12_000_001)
                    if len(body)>12_000_000: raise ValueError('DATA_RESPONSE_TOO_LARGE')
                    return io.BytesIO(body)
            except Exception:
                guard.errors.append({'host':domain,'code':'NETWORK_ERROR'}); raise
        urllib.request.urlopen=urlopen
