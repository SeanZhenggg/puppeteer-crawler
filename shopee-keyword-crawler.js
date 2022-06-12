// modules
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os')
const prompt = require('prompt-sync')({ sigint: true })
const { getRandomInt,log } = require('./utils/index');

// constant
const RESULT_LINK_SELECTOR = 'div.NJo7tc.Z26q7c.jGGQ5e > div > a'
const LINK_FILTER_REGEXP = '蝦皮購物台灣'
const GOOGLE_INPUT_SELECTOR = '[title="Google 搜尋"]'
const URL_KEYWORD_PARAMS_REGEXP = /keyword=(%23|%EF%BC%83){0,2}([A-Za-z0-9%]+)/
const URL_TAG_PARAMS_REGEXP = /(%23|%EF%BC%83){0,2}([A-Za-z0-9%]+)-tag/
const SHOPEE_SITE_SYNTAX = 'site:shopee.tw'
const NEXT_PAGE_SELECTOR = "#pnnext"
let DEBUG_LOG

// result variable
const keywordResults = new Set()

// functions
async function doGoogleSearch(page, keyword) {
  try {
    await Promise.all([
      page.waitForNavigation(),
      page.goto('https://google.com')
    ])
    await page.waitForTimeout(getRandomInt() * 1000)
    const input = await page.$(GOOGLE_INPUT_SELECTOR);
    if (input) {
      DEBUG_LOG && log(`Google 搜尋關鍵字 : ${keyword}`)
      await input.focus();
      await input.type(keyword);
    }
    await page.waitForTimeout(getRandomInt() * 1000)

    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(getRandomInt() * 1000)
    await page.waitForSelector('#botstuff') 
  } catch (error) {
    return Promise.reject(`[doGoogleSearch] get error! ${error}`)
  }
}
async function goNextPage(page) {
  try {
    DEBUG_LOG && log(`前往下一頁`)
    await Promise.all([
      page.waitForNavigation(), // The promise resolves after navigation has finished
      page.click(NEXT_PAGE_SELECTOR), // Clicking the link will indirectly cause a navigation
    ]);
    await page.waitForTimeout(getRandomInt() * 1000)

  } catch (error) {
    return Promise.reject(`[goNextPage] get error! ${error}`)
  }
}
async function getFilteredSearchResultLinks(page, filters) {
  try {
    const filterResults = await page.$$eval(RESULT_LINK_SELECTOR, (results, titleFilter) => {
      return results
        .filter(e => {
          const title = e.querySelector('h3').innerText
          const reg = new RegExp(titleFilter)
          return reg.test(title)
        })
        .map(e => e.href)
    }, filters)
    DEBUG_LOG && filterResults.slice().forEach((href) => {
      log(`搜尋結果 ${decodeURIComponent(href)} 匹配。`)
    })
    return filterResults
  } catch (error) {
    return Promise.reject(`[getFilteredSearchResultLinks] get error! ${error}`)
  }
}
async function getSearchResultLinks(page, keyword, pages = 2) {
  let resultLinks = []
  let count = pages
  try {
    await doGoogleSearch(page, keyword)
    DEBUG_LOG && log(`此次搜尋${pages}頁, 共${pages * 10}筆結果`)
    while(--count >= 0) {
      DEBUG_LOG && log(`現在搜尋第 ${pages - count} 頁...`)
      const results = await getFilteredSearchResultLinks(page, LINK_FILTER_REGEXP)
      resultLinks = resultLinks.concat(results)
      if(count === 0) break
      await goNextPage(page)
    }
    return resultLinks
  } catch (error) {
    return Promise.reject(`[getSearchResultLinks] get error! ${error}`)
  }
}
function getKeyword(data) {
  switch(true) {
    case /keyword=/.test(data):
      var [, , matched] = data.match(URL_KEYWORD_PARAMS_REGEXP)
      return decodeURIComponent(matched)
    case /-tag/.test(data):
      var [, , matched] = data.match(URL_TAG_PARAMS_REGEXP)
      return decodeURIComponent(matched)
    default:
      return false
  }
}
async function recursivelyGetKeywords(page, keyword, index = 0) {
  if(index === 0) DEBUG_LOG && log(`現在是第一層 ${keyword} 關鍵字搜尋...`)
  else DEBUG_LOG && log(`現在是第二層 ${keyword} 關鍵字搜尋...`)

  let resultLinks = await getSearchResultLinks(page, `${keyword} ${SHOPEE_SITE_SYNTAX}`)

  try {
    for(let i = 0; i < resultLinks.length; i++) {
      const pageUrl = resultLinks[i]

      let matchedKeyword = getKeyword(pageUrl)
      if(matchedKeyword) {
        DEBUG_LOG && log([`找到關鍵字 : \x1b[33m${matchedKeyword}\x1b[0m`])
        keywordResults.add(matchedKeyword)
      }
      else {
        DEBUG_LOG && log(['\x1b[33m%s\x1b[0m', `[DEBUG MODE] [訊息]: 此連結沒有找到符合關鍵字(keyword或是tag): ${decodeURIComponent(pageUrl)}, 將不計入結果內`])
      }

      if(index !== 1) {
        await recursivelyGetKeywords(page, matchedKeyword, index + 1)
      }
    }
  } catch (error) {
    return Promise.reject(`[recursivelyGetKeywords] get error! ${error}`)
  }
}
function getResult(results) {
  if(!(results instanceof Set)) throw new Error('[getResult] get error! wrong input type')
  return Array.from(results).reduce((result, keyword) => {
    return result += keyword + '\n'
  }, '')
}
async function main () {
  try {
    // deal with user input
    const INPUT_KEYWORD = prompt('請輸入你想撈取的關鍵字: ')

    let IS_HEADLESS_MODE = prompt('是否要使用無視窗模式(預設為否): 輸入 "y" or "n"', 'n')
    if(IS_HEADLESS_MODE !== 'y' && IS_HEADLESS_MODE !== 'n') {
      log('輸入錯誤，終止程式。bye bye~')
      process.exit()
    } else {
      IS_HEADLESS_MODE = IS_HEADLESS_MODE === 'y'
    }

    const homeDir = os.homedir()
    let OUTPUT_FILE_PATH = prompt('結果存取位置(預設為桌面): ', homeDir)
    if(OUTPUT_FILE_PATH == homeDir) {
      OUTPUT_FILE_PATH = path.join(OUTPUT_FILE_PATH, "Desktop")
    }
    const OUTPUT_FILE_NAME = 'result.txt'
    const ABS_OUTPUT = path.join(OUTPUT_FILE_PATH, 'result.txt')
    
    DEBUG_LOG = prompt('是否要觀看撈取過程訊息(預設為否): 輸入 "y" or "n"', 'n')
    if(DEBUG_LOG !== 'y' && DEBUG_LOG !== 'n') {
      log('輸入錯誤，預設為不顯示撈取過程訊息')
      DEBUG_LOG = false
    } else {
      DEBUG_LOG = DEBUG_LOG === 'y'
    }

    log(
      `撈取的關鍵字名稱 : ${INPUT_KEYWORD}`, 
      `是否使用無視窗模式 : ${IS_HEADLESS_MODE ? `是` : `否`}`,
      `是否要觀看撈取過程訊息 : ${DEBUG_LOG ? `是` : `否`}`,
      `結果存取位置 : ${OUTPUT_FILE_PATH}`,
      `檔名為 : ${OUTPUT_FILE_NAME}`
    )

    // launch puppeteer
    const browser = await puppeteer.launch({
      headless: IS_HEADLESS_MODE, // 不使用 headless 模式，就會開啟瀏覽器來實際動作
      slowMo: 100, // 每個動作的間隔時間，方便觀察實際動作
    });
    
    // new page
    const page = await browser.newPage(); // 開啟新分頁
    await page.waitForTimeout(getRandomInt() * 1000)
    
    // get keywords
    await recursivelyGetKeywords(page, INPUT_KEYWORD, 0)
    DEBUG_LOG && log(`搜尋結束，一共找到 ${keywordResults.size} 個關鍵字`)
    const result = getResult(keywordResults)
    
    // write file
    fs.writeFile(ABS_OUTPUT, result, (err) => {
      if(err) throw err;
      log(`已儲存檔案。檔案存放路徑: ${ABS_OUTPUT}`)
      browser.close()
      log(`執行結束。 bye bye~`)
      process.exit()
    })
  } catch (error) {
    log('程式錯誤，終止程式。\n錯誤訊息為: \n', error)
    process.exit(1)
  }
}

// main
main()