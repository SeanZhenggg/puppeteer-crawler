const puppeteer = require('puppeteer');
const fs = require('fs')

// some used constant
let INPUT_KEYWORD
const RESULT_LINK_SELECTOR = 'div.NJo7tc.Z26q7c.jGGQ5e > div > a'
const LINK_FILTER_REGEXP = '蝦皮購物台灣'
const GOOGLE_INPUT_SELECTOR = 'body > div.L3eUgb > div.o3j99.ikrT4e.om7nvf > form > div:nth-child(1) > div.A8SBwf > div.RNNXgb > div > div.a4bIc > input'
const URL_KEYWORD_PARAMS_REGEXP = /keyword=([A-Za-z0-9%]+)/
const URL_TAG_PARAMS_REGEXP = /([A-Za-z0-9%]+)-tag/
const SHOPEE_SITE_SYNTAX = 'site:shopee.tw'
const OUTPUT_FILE_NAME = 'result.txt'

async function doGoogleSearch(page, keyword) {
  await page.goto('https://google.com');

  const input = await page.$(GOOGLE_INPUT_SELECTOR);
  if (input) {
    await input.focus();
    await input.type(keyword);
  }

  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#botstuff')
}

async function getFilteredSearchResultLinks(page, filters) {
  const filterResults = await page.$$eval(RESULT_LINK_SELECTOR, (results, titleFilter) => {
    return results
      .filter(e => {
        const title = e.querySelector('h3').innerText
        const reg = new RegExp(titleFilter)
        return reg.test(title)
      })
      .map(e => e.href)
  }, filters)

  return filterResults
}

async function getSearchResultLinks(page, keyword) {
  await doGoogleSearch(page, keyword)

  return await getFilteredSearchResultLinks(page, LINK_FILTER_REGEXP)
}

function getKeyword(data) {
  switch(true) {
    case /keyword=/.test(data):
      var [, matched] = data.match(URL_KEYWORD_PARAMS_REGEXP)
      return decodeURIComponent(matched)
    case /-tag/.test(data):
      var [, matched] = data.match(URL_TAG_PARAMS_REGEXP)
      return decodeURIComponent(matched)
    default:
      console.error('[getKeyword] no keyword matched!')
      return undefined
  }
}

async function recursiveGetSearchKeywords(page, results, index = 0) {
  const keywordResults = new Set()
  for(let i = 0; i < results.length; i++) {
    const pageUrl = results[i]
    
    let keyword = getKeyword(pageUrl)
    if(keyword) {
      keywordResults.add(keyword)
    }

    if(index !== 1) {
      let secondaryResult = await getSearchResultLinks(page, `${keyword} ${SHOPEE_SITE_SYNTAX}`)
      recursiveGetSearchKeywords(page, secondaryResult, index + 1)
    }
  }

  return keywordResults
}

function getResult(results) {
  return Array.from(results).reduce((result, keyword) => {
    return result += keyword + '\n'
  }, '')
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false, // 不使用 headless 模式，就會開啟瀏覽器來實際動作
    slowMo: 50, // 每個動作的間隔時間，方便觀察實際動作
  });

  const page = await browser.newPage(); // 開啟新分頁

  let filterResults = await getSearchResultLinks(page, `耳溫槍 ${SHOPEE_SITE_SYNTAX}`)
  
  const keywordResults = await recursiveGetSearchKeywords(page, filterResults, 0)

  const result = getResult(keywordResults)
  
  fs.writeFile(OUTPUT_FILE_NAME, result, (err) => {
    if(err) throw err;
    console.log(`已儲存存檔案。檔案名稱為: ${OUTPUT_FILE_NAME}`)
  })

  // browser.close();
  // let body = await page.content()
  // let $ = await cheerio.load(body)
  // let data = await $(RESULT_LINK_SELECTOR)
  // let filter = data.filter(function(i, el) {
  //   return $(this).children('h3').text().match(LINK_FILTER_REGEXP)
  // })
  // filter.each(function(i, ele) {
  //   console.log('搜尋到以下連結: \n', $(this).children('h3').text())
  // })

  // filter.each(function(i, ele) {
    
  // })

  // page.click(RESULT_LINK_SELECTOR)
})();