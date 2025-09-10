module.exports = {
  // Mobile Top-up API Configuration
  mobileTopup: {
    baseUrl: 'https://smartdigitalnepal.com/',
    token: 'EMQx29Ap6KmSs2DWD0RiYs8EnrPZfv+Ga0Q2wLG4Ql0=',
    
    // API Endpoints
    endpoints: {
      ntc: 'https://uatservices.mypay.com.np/api/service/topup-ntc',
      ncell: 'https://uatservices.mypay.com.np/api/service/topup-ncell'
    },
    
    // Amount limits
    limits: {
      ntc: {
        min: 20,
        max: 25000
      },
      ncell: {
        min: 50,
        max: 5000
      }
    },
    
    // SIM type mapping
    simTypes: {
      NTC: 'ntc',
      NCELL: 'ncell'
    }
  }
};
