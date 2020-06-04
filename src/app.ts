import * as express    from 'express'
import * as bodyParser from 'body-parser'
import { get, getFile, sendEmail }    from './util/util'
import * as cheerio from 'cheerio'
import * as md5 from 'md5'
import config from './config'

const app = express()
app.set("port", process.env.PORT || 3000)
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

let listings = {}
let isInit = false
let lastHash = false

const downPayment   = config.downPayment
const mortgageLimit = config.mortgageLimit
const mortgageRate  = config.mortgageRate

const townhouseURL  = config.townhouseURL
const houseURL      = config.houseURL
const condoURL      = config.condoURL

function getListings(type, url) {
  if(Object.keys(listings).length > 1000) {
    listings = {}
    isInit = false
  }

  // get(url).then( body => {
  getFile('./test.html').then( body => {
    if(body == undefined) return
    const $ = cheerio.load(body)
    $('.multiLineDisplay.ajax_display').each( function(index,el) {
      try {
        let listing = {}
        let listingTitle = $(this).find('.d-fontWeight--normal.d-color--brandDark.d-fontSize--largest a')
        if(listingTitle.text() == '') return
        listing['address'] = listingTitle.text()
        let linkTitle = listing['address'].match(/([0-9A-z]*)\s\-\s(.*)/)
        if(linkTitle != null && linkTitle.hasOwnProperty(2)) {
          linkTitle = linkTitle[2]
        } else {
          linkTitle = listing['address']
        }
        let listingPrice = $(this).find('.col-xs-12.col-md-12.col-sm-12.col-lg-12 .d-fontSize--largest')
        listing['price'] = parseInt(listingPrice.text().replace(',','').replace('$',''))
        let listingAreaParents = $(this).find('.col-lg-7.col-md-6.col-sm-12').contents()
        listingAreaParents.each(function(i,e){
          if(i == 2) {
            listing['area'] = $(this).find('.col-lg-12.col-sm-12 .formula.J_formula').text()
          }
        })
        if(!listing.hasOwnProperty('area')) {
          listing['area'] = ''
        }
        let detailsPara = $(this).find('.col-sm-12 .row .col-sm-.12.col-sm-12').text()

        listing['beds'] = parseInt(detailsPara.match(/[Apartment|Townhouse|Single\sFamily\sDetached]([0-9])Beds/)[1])
        listing['baths'] = parseInt(detailsPara.match(/Beds([0-9])Baths/)[1])
        listing['sqft'] = parseInt(detailsPara.match(/Kitchens([0-9,]*)Fin/)[1].replace(',',''))
        if(detailsPara.match(/Strata Fee\$([0-9,]*)/) != null) {
          listing['strata'] = parseInt(detailsPara.match(/Strata Fee\$([0-9,]*)/)[1])
        } else {
          listing['strata'] = 0
        }

        let imageURL = ''
        let images = $(this).find('.img-responsive.ivrImg')
        if(images.length > 0) {
          imageURL = images[0].attribs.src
        }

        if(!listings.hasOwnProperty(listing['address']) || md5(JSON.stringify(listing)) != md5(JSON.stringify(listings[listing['address']]))) {
          let isNew = (!listings.hasOwnProperty(listing['address']))

          let oldPrice = -1
          if(!isNew) {
            oldPrice  = listings[listing['address']]['price']
          }

          listings[listing['address']] = listing
          if(isInit) {
            console.log(`Changed ${listing['address']}...`)

            let subject = ''
            if(isNew) {
              subject = `NEW ${type.toUpperCase()} - ${listing['area']} - $${numberWithCommas(listing['price'])} - ${listing['address']}`
            } else {
              subject = `CHANGED ${type.toUpperCase()} - ${listing['area']} - $${numberWithCommas(listing['price'])} - ${listing['address']}`
            }

            let body = `Address: ${listing['address']}<br>Area: ${listing['area']}<br>Beds: ${listing['beds']}<br>Baths: ${listing['baths']}<br>SqFt: ${listing['sqft']}`
            if(oldPrice > -1) {
              body += `<br>New Price: $${numberWithCommas(listing['price'])}<br>Old Price: $${numberWithCommas(oldPrice)}`
            }
            body += `<br>Price: $${numberWithCommas(listing['price'])}<br>Mortgage Insurance: $${numberWithCommas(getCMHC(listing['price']).toFixed(2))}<br>Land Transfer: $${numberWithCommas(getLandTransfer(listing['price']).toFixed(2))}<br><br>Strata: $${listing['strata']}<br>Mortgage Monthly: $${numberWithCommas(getMortgage(listing['price']).toFixed(2))}<br>Mortgage Insurance Monthly: $${numberWithCommas(parseInt(getMortgage(listing['price'] + getCMHC(listing['price'])).toFixed(2)) - parseInt(getMortgage(listing['price']).toFixed(2)))}<br><br>Total Monthly (Mortgage + Strata + Insurance): $${numberWithCommas(parseInt(getMortgage(listing['price'] + getCMHC(listing['price'])).toFixed(2)) + parseInt(listing['strata']) )}<br><br><br>Link: https://www.google.com/maps/place/${linkTitle.replace(/\s/g, '+')}<br>Listings: ${url}<br><br><img src="${imageURL}" />`

            if(
                (
                  parseInt(
                    getMortgage(
                      listing['price']
                    ).toFixed(2)
                  )
                  + parseInt(listing['strata']) < mortgageLimit
                )
                // <INSERT YOUR STRING FILTERS HERE>
                // ie. ignore anything with colwood or bear mountain in the subject
                && subject.toLowerCase().indexOf('colwood') == -1
                && subject.toLowerCase().indexOf('bear mountain') == -1

              ) {
                sendEmail(subject, body)
            }
          } else {
            console.log(`Adding ${listing['address']}...`)
          }
        }
      } catch (e) {
        console.log(e)
      }
    })

    if(type != 'condo') {
      if(lastHash != md5(JSON.stringify(listings))) {
        console.log('New hash...')
        lastHash = md5(JSON.stringify(listings))
      } else {
        console.log('Nothing changed...')
      }
    }
  }).then(()=>{
    if(type == 'condo') {
      getListings('townhouse',townhouseURL)
    } else if(type == 'townhouse') {
      getListings('house',houseURL)
    } else {
      if(isInit == false) {
        console.log('Initialized...')
        isInit = true
      }
      setTimeout(() => {getListings('condo',condoURL)}, 300000)
    }
  })
}

getListings('condo',condoURL)

export default app

function numberWithCommas(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Rough mortgage formula I found online. Double check it if you want
function getMortgage(amt) {
  amt -= downPayment
	var payment = amt*((mortgageRate/1200) * Math.pow((1 + (mortgageRate/1200) ), (25*12) ))/(Math.pow((1 + (mortgageRate/1200) ), (25*12) )  - 1);
	return payment;
}

function getCMHC(amt: number) {
  let insAmt = 0.04
  if(downPayment/amt >= 0.1) {
    insAmt = 0.031
  }
  if(downPayment/amt >= 0.15) {
    insAmt = 0.028
  }
  if(downPayment/amt >= 0.2) {
    insAmt = 0.0
  }
  let loan = amt - downPayment
  let insuranceTot = loan * insAmt
  return insuranceTot
}

function getLandTransfer(amt: number) {
  if(amt <= 500000) return 0
  let remAmt = amt - 200000
  let landTransfer = 2000

  landTransfer += (remAmt * .02)

  let firstTimeMult = 1

  if(amt < 525000) {
    firstTimeMult = (amt - 500000) / 25000
  }

  return landTransfer * firstTimeMult
}
