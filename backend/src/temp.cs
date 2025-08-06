public Startup(IConfiguration configuration, IWebHostEnvironment webHostEnvironment)
{
  Configuration = configuration;
  _webHostEnvironment = webHostEnvironment;
  Configuration.GetSection(nameof(SystemConfig)).Bind(mSystemConfig);
}

public IConfiguration Configuration { get; }
private readonly IWebHostEnvironment _webHostEnvironment;
private readonly SystemConfig mSystemConfig = new SystemConfig();
private readonly ActivitySource mActivitySource = new(Assembly.GetEntryAssembly()?.GetName().Name ?? "RTVA.RAP.OperatorAPI");


// This method gets called by the runtime. Use this method to add services to the container.
public void ConfigureServices(IServiceCollection services)
{
  const string headername = "X-Api-Key";


  // Operator API is first project to be built and we need to copy all test model DBs (main, measure) before
  // the tests run
  bool isNeedToCopyAllDBsForTesting = TestsHelper.AreTestsRunning;

  services.AddResponseCompression();

  services.AddAutoMapper(typeof(Startup));

  services.AddDbMain(mSystemConfig.CreateIndexesOnStartup ? typeof(MediaTrackingIndex).Assembly : null,
    mSystemConfig.SendNewDatabaseEmail, mSystemConfig.ConfigureDatabaseOnStartup);
  services.AddDbArchive(Configuration,
    mSystemConfig.CreateIndexesOnStartup ? typeof(MediaTrackingIndex).Assembly : null,
    mSystemConfig.SendNewDatabaseEmail, mSystemConfig.ConfigureDatabaseOnStartup);
  services.AddDbLog(Configuration, null, false, false);