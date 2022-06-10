const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs')
const KEYWORD_REGEXP = /(.+)-\s?(?=[\u4e00-\u9fa5])/
const RESULT_LINK_SELECTOR = 'div.NJo7tc.Z26q7c.jGGQ5e > div > a'
const LINK_FILTER_REGEXP = '蝦皮購物台灣'
const SHOPEE_INPUT_SELECTOR = '#main > div > div.shopee-top.container-wrapper > div.container-wrapper.header-with-search-wrapper > div > div.header-with-search__search-section > div.shopee-searchbar > div > form > input'
const GOOGLE_INPUT_SELECTOR = 'body > div.L3eUgb > div.o3j99.ikrT4e.om7nvf > form > div:nth-child(1) > div.A8SBwf > div.RNNXgb > div > div.a4bIc > input'
const URL_KEYWORD_PARAMS_REGEXP = /keyword=([A-Za-z0-9%]+)/
const URL_TAG_PARAMS_REGEXP = /([A-Za-z0-9%]+)-tag/
const SHOPEE_SITE_SYNTAX = 'site:shopee.tw'
const keywordResults = new Set()

async function googleSearch(page, keyword, resultFilter = LINK_FILTER_REGEXP) {
  await page.goto('https://google.com');

  await goSearch(page, keyword)
  
  await page.waitForSelector('#botstuff')

  let filterResults = await filterSearchResults(page, resultFilter)
  return filterResults
}

async function goSearch(page, keyword, selector = GOOGLE_INPUT_SELECTOR) {
  const input = await page.$(selector);

  if (input) {
    await input.focus();
    await input.type(keyword);
  }

  await page.keyboard.press('Escape');

  await page.keyboard.press('Enter');
}

async function filterSearchResults(page, filters) {
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

async function recursiveGetSearchKeywords(page, results, index = 0) {
  for(let i = 0; i < results.length; i++) {
    const pageUrl = results[i]
    let keyword

    if(/keyword=/.test(pageUrl)) {
      const [, matched] = pageUrl.match(URL_KEYWORD_PARAMS_REGEXP)
      keyword = decodeURIComponent(matched)
    } else if (/-tag/.test(pageUrl)) {
      const [, matched] = pageUrl.match(URL_TAG_PARAMS_REGEXP)
      keyword = decodeURIComponent(matched)
    }
    keywordResults.add(keyword)

    if(index !== 1) {
      let secondaryResult = await googleSearch(page, `${keyword} ${SHOPEE_SITE_SYNTAX}`)
      recursiveGetSearchKeywords(page, secondaryResult, index + 1)
    }
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false, // 不使用 headless 模式，就會開啟瀏覽器來實際動作
    slowMo: 50, // 每個動作的間隔時間，方便觀察實際動作
  });
  const page = await browser.newPage(); // 開啟新分頁

  let filterResults = await googleSearch(page, `耳溫槍 ${SHOPEE_SITE_SYNTAX}`)
  
  await recursiveGetSearchKeywords(page, filterResults, 0)

  console.log('keywordResults = ', keywordResults)
  const result = Array.from(keywordResults).reduce((result, keyword) => {
    return result += keyword + '\n'
  }, '')
  fs.writeFile('result.txt', result, (err) => {
    if(err) throw err;
    console.log('saved!')
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